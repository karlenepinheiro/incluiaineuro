import React, { useMemo, useState, useEffect } from 'react';
import {
  Edit, Trash2, Search, Users, UserPlus,
  Upload, AlertCircle, LayoutGrid, List, Eye, ChevronDown,
  FileCheck2, Clock,
} from 'lucide-react';
import { Student, PlanTier, getPlanLimits, type User, type ProfileSex } from '../types';
import { StudentCodeSearchModal } from '../components/StudentCodeSearchModal';
import { StudentImportModal } from '../components/StudentImportModal';
import { StudentsHeroBanner } from '../components/StudentsHeroBanner';
import { getStudentBasicCompletionStatus } from '../services/csvImportService';

// ── TEA icon (Puzzle) ─────────────────────────────────────────────────────────
const PuzzleIcon = (
  <svg width="20" height="20" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg"
    style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}>
    <rect x="1"    y="1"    width="8.5" height="8.5" rx="1.5" fill="#EF4444"/>
    <rect x="12.5" y="1"    width="8.5" height="8.5" rx="1.5" fill="#3B82F6"/>
    <rect x="1"    y="12.5" width="8.5" height="8.5" rx="1.5" fill="#22C55E"/>
    <rect x="12.5" y="12.5" width="8.5" height="8.5" rx="1.5" fill="#F59E0B"/>
    <circle cx="11"    cy="5.75"  r="2.1" fill="#EF4444"/>
    <circle cx="11"    cy="16.25" r="2.1" fill="#22C55E"/>
    <circle cx="5.75"  cy="11"    r="2.1" fill="#EF4444"/>
    <circle cx="16.25" cy="11"    r="2.1" fill="#3B82F6"/>
  </svg>
);

// ── Neuro icon (Sunflower) ────────────────────────────────────────────────────
const SunflowerIcon = (
  <svg width="20" height="20" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg"
    style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}>
    <ellipse cx="11" cy="3"  rx="2"   ry="3.2" fill="#FBBF24"/>
    <ellipse cx="11" cy="19" rx="2"   ry="3.2" fill="#FBBF24"/>
    <ellipse cx="3"  cy="11" rx="3.2" ry="2"   fill="#FBBF24"/>
    <ellipse cx="19" cy="11" rx="3.2" ry="2"   fill="#FBBF24"/>
    <ellipse cx="5.5"  cy="5.5"  rx="2" ry="3" fill="#FBBF24" transform="rotate(-45 5.5 5.5)"/>
    <ellipse cx="16.5" cy="5.5"  rx="2" ry="3" fill="#FBBF24" transform="rotate(45 16.5 5.5)"/>
    <ellipse cx="5.5"  cy="16.5" rx="2" ry="3" fill="#FBBF24" transform="rotate(45 5.5 16.5)"/>
    <ellipse cx="16.5" cy="16.5" rx="2" ry="3" fill="#FBBF24" transform="rotate(-45 16.5 16.5)"/>
    <circle cx="11" cy="11" r="4.2" fill="#92400E"/>
    <circle cx="11" cy="11" r="2.5" fill="#78350F" opacity="0.6"/>
  </svg>
);

// ── Support visual helper (exported — usado em StudentProfile.tsx) ─────────────
type SupportVisual = {
  type: 'tea' | 'neuro';
  icon: React.ReactNode;
  tooltip: string;
  label: string;
  color: string;
} | null;

export function getStudentSupportVisual(student: Student): SupportVisual {
  const hasDiagnosis =
    (student.diagnosis?.length ?? 0) > 0 ||
    (Array.isArray(student.cid) ? student.cid.some(c => c?.trim()) : !!student.cid?.toString().trim());

  if (!hasDiagnosis) return null;

  const diagText = [
    ...(student.diagnosis ?? []),
    ...(Array.isArray(student.cid) ? student.cid : student.cid ? [String(student.cid)] : []),
  ].join(' ').toLowerCase();

  const isAutism = /tea|autis|f84|espectro autista|tgd/.test(diagText);

  return isAutism
    ? { type: 'tea',   icon: PuzzleIcon,    tooltip: 'Aluno com TEA — suporte específico',              label: 'TEA',   color: '#3B82F6' }
    : { type: 'neuro', icon: SunflowerIcon, tooltip: 'Aluno com neurodivergência — suporte específico',  label: 'Neuro', color: '#F59E0B' };
}

// ── Color palette ──────────────────────────────────────────────────────────────
const C = {
  bg:         '#F5F6F8',
  surface:    '#FFFFFF',
  text:       '#0F172A',
  textSec:    '#475569',
  textMuted:  '#94A3B8',
  petrol:     '#1F4E5F',
  dark:       '#2E3A59',
  gold:       '#C69214',
  goldLight:  '#FDF6E3',
  border:     '#E7E2D8',
  borderMid:  '#C9C3B5',
  red:        '#DC2626',
  redLight:   '#FEF2F2',
  amber:      '#D97706',
  amberLight: '#FFFBEB',
  tealLight:  '#EEF6F9',
};

// ── Pagination constants ───────────────────────────────────────────────────────
const INITIAL_VISIBLE  = 10;
const LOAD_MORE_STEP   = 10;
const VIEW_MODE_KEY    = 'studentsViewMode';

// ── Date / field helpers ───────────────────────────────────────────────────────
function fmtDate(dateStr?: string | null): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr.includes('T') ? dateStr : dateStr + 'T00:00:00');
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('pt-BR');
  } catch { return '—'; }
}

function fmtBirthDate(dateStr?: string | null): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr.includes('T') ? dateStr : dateStr + 'T00:00:00');
    if (isNaN(d.getTime())) return '—';
    const today = new Date();
    let age = today.getFullYear() - d.getFullYear();
    const m = today.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age--;
    return `${d.toLocaleDateString('pt-BR')} (${age}a)`;
  } catch { return '—'; }
}

function guardianName(s: Student): string {
  return (
    s.guardianName?.trim() ||
    s.sociofamilyData?.guardian1?.fullName?.trim() ||
    s.primaryContactName?.trim() ||
    '—'
  );
}

function guardianPhone(s: Student): string {
  return (
    s.guardianPhone?.trim() ||
    s.sociofamilyData?.guardian1?.phone?.trim() ||
    s.primaryContactPhone?.trim() ||
    '—'
  );
}

function diagnosisText(s: Student): string {
  const parts = (s.diagnosis ?? []).filter(Boolean);
  return parts.length ? parts.join(', ') : '—';
}

// ── Props / types ──────────────────────────────────────────────────────────────
interface StudentsListViewProps {
  students: Student[];
  planMaxStudents?: number;
  userPlan: PlanTier;
  user?: User;
  professorSexo?: ProfileSex | null;
  onSelect: (s: Student) => void;
  onEdit: (s: Student) => void;
  onDelete: (id: string) => void;
  onCreateTriagem: () => void;
  onCreateComLaudo: () => void;
  onStudentImported?: (studentId: string, protocolCode: string | null) => void;
  onImportStudents?: (importedCount: number) => void;
}

type FilterType = 'all' | 'em_triagem' | 'com_laudo' | 'externo' | 'incompleto' | 'importado_incompleto';

// ── Main view ──────────────────────────────────────────────────────────────────
export const StudentsListView: React.FC<StudentsListViewProps> = ({
  students,
  planMaxStudents,
  userPlan,
  user,
  professorSexo,
  onSelect,
  onEdit,
  onDelete,
  onCreateTriagem,
  onCreateComLaudo,
  onStudentImported,
  onImportStudents,
}) => {
  const [search, setSearch]   = useState('');
  const [filter, setFilter]   = useState<FilterType>('all');
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);
  const [showCodeSearch, setShowCodeSearch] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
    try {
      const saved = localStorage.getItem(VIEW_MODE_KEY);
      return saved === 'list' ? 'list' : 'grid';
    } catch { return 'grid'; }
  });

  const handleSetViewMode = (mode: 'grid' | 'list') => {
    setViewMode(mode);
    try { localStorage.setItem(VIEW_MODE_KEY, mode); } catch {}
  };

  // Reset pagination when filter or search changes
  useEffect(() => { setVisibleCount(INITIAL_VISIBLE); }, [search, filter]);

  const maxStudents = planMaxStudents && planMaxStudents > 0
    ? planMaxStudents
    : getPlanLimits(userPlan).students;

  const filtered = useMemo(() => students.filter(s => {
    const matchSearch =
      (s.name ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (s.diagnosis ?? []).join(' ').toLowerCase().includes(search.toLowerCase());
    if (!matchSearch) return false;
    if (filter === 'em_triagem')          return s.tipo_aluno === 'em_triagem';
    if (filter === 'com_laudo')           return s.tipo_aluno === 'com_laudo';
    if (filter === 'externo')             return s.isExternalStudent === true;
    if (filter === 'incompleto')          return getStudentBasicCompletionStatus(s) === 'invalid';
    if (filter === 'importado_incompleto') return s.importSource === 'csv' && getStudentBasicCompletionStatus(s) === 'invalid';
    return true;
  }), [students, search, filter]);

  const visibleStudents = filtered.slice(0, visibleCount);

  const counts = useMemo(() => ({
    total:                students.length,
    triagem:              students.filter(s => s.tipo_aluno === 'em_triagem').length,
    laudo:                students.filter(s => s.tipo_aluno === 'com_laudo').length,
    externo:              students.filter(s => s.isExternalStudent).length,
    incompleto:           students.filter(s => getStudentBasicCompletionStatus(s) === 'invalid').length,
    importado_incompleto: students.filter(s => s.importSource === 'csv' && getStudentBasicCompletionStatus(s) === 'invalid').length,
  }), [students]);

  const usagePct = maxStudents > 0 ? Math.min(100, (students.length / maxStudents) * 100) : 0;

  const filterTabs: { id: FilterType; label: string; count: number; alert?: boolean }[] = [
    { id: 'all',                 label: 'Todos',               count: counts.total },
    { id: 'com_laudo',           label: 'Com Laudo',           count: counts.laudo },
    { id: 'em_triagem',          label: 'Em Triagem',          count: counts.triagem },
    { id: 'externo',             label: 'Externos',            count: counts.externo },
    { id: 'incompleto',          label: 'Incompletos',         count: counts.incompleto,           alert: true },
    { id: 'importado_incompleto', label: 'Importado Incompleto', count: counts.importado_incompleto, alert: true },
  ];

  return (
    <div className="min-h-screen px-4 sm:px-6 lg:px-8 pt-4 pb-6" style={{ background: C.bg }}>
      <div className="max-w-[1600px] mx-auto">

        {/* ── Hero banner ── */}
        <StudentsHeroBanner
          showCodeSearch={!!user}
          onSearchCode={() => setShowCodeSearch(true)}
          onSmartRegistration={() => setShowImportModal(true)}
          onCreateTriagem={onCreateTriagem}
          onCreateComLaudo={onCreateComLaudo}
          professorSexo={professorSexo}
        />

        {/* ── Indicadores (sobrepostos ao hero) — dados reais já calculados em `counts` acima ── */}
        <div className="relative z-10 -mt-8 sm:-mt-10 mb-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total de alunos',     value: counts.total,      icon: Users,       color: C.petrol },
            { label: 'Com laudo',           value: counts.laudo,      icon: FileCheck2,  color: '#059669' },
            { label: 'Em triagem',          value: counts.triagem,    icon: Clock,       color: C.amber },
            { label: 'Precisam de atenção', value: counts.incompleto, icon: AlertCircle, color: C.red },
          ].map(s => (
            <div
              key={s.label}
              className="rounded-2xl p-4 flex items-center gap-3 shadow-md"
              style={{ background: C.surface, border: `1px solid ${C.border}` }}
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: s.color + '18' }}
              >
                <s.icon size={18} style={{ color: s.color }} />
              </div>
              <div className="min-w-0">
                <p className="text-xl font-extrabold leading-none" style={{ color: C.text }}>{s.value}</p>
                <p className="text-[11px] mt-1 truncate" style={{ color: C.textSec }}>{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── Vagas utilizadas — informação secundária, reposicionada aqui (não ocupa mais o destaque logo abaixo do hero) ── */}
        <div className="flex items-center gap-3 mb-5 px-1">
          <Users size={13} style={{ color: C.textMuted, flexShrink: 0 }} />
          <span className="text-xs shrink-0" style={{ color: C.textMuted }}>
            Vagas utilizadas: {students.length} / {maxStudents}
          </span>
          <div className="flex-1 max-w-[160px] h-1 rounded-full overflow-hidden" style={{ background: '#F3F4F6' }}>
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
          <span className="text-xs shrink-0" style={{ color: usagePct > 80 ? '#EF4444' : C.textMuted }}>
            {Math.round(usagePct)}%
          </span>
        </div>

        {/* ── Search + view toggle + filters ── */}
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

          {/* View mode toggle */}
          <div
            className="flex rounded-xl overflow-hidden shrink-0"
            style={{ border: `1.5px solid ${C.border}`, background: C.surface }}
          >
            {(['grid', 'list'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => handleSetViewMode(mode)}
                className="px-3 py-2 transition"
                title={mode === 'grid' ? 'Visualização em quadro' : 'Visualização em lista'}
                style={viewMode === mode ? { background: C.petrol, color: '#fff' } : { color: C.textSec }}
              >
                {mode === 'grid' ? <LayoutGrid size={15} /> : <List size={15} />}
              </button>
            ))}
          </div>

          {/* Filter tabs */}
          <div
            className="flex rounded-xl overflow-hidden overflow-x-auto"
            style={{ border: `1px solid ${C.border}`, background: C.surface }}
          >
            {filterTabs.map(tab =>
              tab.id === 'incompleto' && tab.count === 0 ? null : (
                <button
                  key={tab.id}
                  onClick={() => setFilter(tab.id)}
                  className="px-3 py-2 text-xs font-medium transition flex items-center gap-1 whitespace-nowrap"
                  style={
                    filter === tab.id
                      ? { background: tab.alert ? C.red : C.petrol, color: '#fff' }
                      : { color: tab.alert && tab.count > 0 ? C.red : C.textSec }
                  }
                >
                  {tab.alert && tab.count > 0 && filter !== tab.id && <AlertCircle size={11} />}
                  {tab.label}
                  {tab.count > 0 && (
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded-full ml-1"
                      style={
                        filter === tab.id
                          ? { background: 'rgba(255,255,255,0.2)', color: '#fff' }
                          : tab.alert
                            ? { background: C.redLight, color: C.red }
                            : { background: '#F3F4F6', color: '#9CA3AF' }
                      }
                    >
                      {tab.count}
                    </span>
                  )}
                </button>
              )
            )}
          </div>
        </div>

        {/* ── Content ── */}
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
              {search ? 'Tente outros termos' : 'Use os botões acima para cadastrar o primeiro aluno'}
            </p>
          </div>
        ) : viewMode === 'list' ? (
          <StudentListView
            students={visibleStudents}
            onSelect={onSelect}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {visibleStudents.map(s => (
              <StudentGridCard
                key={s.id}
                student={s}
                onSelect={onSelect}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ))}
          </div>
        )}

        {/* ── Ver mais / counter ── */}
        {filtered.length > 0 && (
          <div className="mt-8 flex flex-col items-center gap-3">
            <p className="text-sm" style={{ color: C.textMuted }}>
              Mostrando {Math.min(visibleCount, filtered.length)} de {filtered.length} aluno{filtered.length !== 1 ? 's' : ''}
            </p>
            {filtered.length > visibleCount && (
              <button
                onClick={() => setVisibleCount(v => v + LOAD_MORE_STEP)}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl font-medium text-sm transition"
                style={{
                  background: C.surface,
                  color: C.petrol,
                  border: `1.5px solid ${C.petrol}`,
                  boxShadow: '0 1px 4px rgba(31,78,95,0.08)',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLButtonElement).style.background = C.tealLight;
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLButtonElement).style.background = C.surface;
                }}
              >
                <ChevronDown size={16} /> Ver mais {Math.min(LOAD_MORE_STEP, filtered.length - visibleCount)} alunos
              </button>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
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
      {showImportModal && user && (
        <StudentImportModal
          tenantId={user.tenant_id}
          userId={user.id}
          onClose={() => setShowImportModal(false)}
          // Sprint "consumo no momento certo" (26/08/2026, ajuste do
          // 26/08/2026 tarde): o Gateway confirma (commit) o crédito na mesma
          // requisição que entrega a análise — antes de qualquer salvamento.
          // Cancelar a revisão sem salvar NÃO estorna o crédito. O próprio
          // modal decide QUANDO chamar isto (uma vez ao abrir a revisão, e
          // como rede de segurança ao fechar só se ainda não tiver
          // sincronizado) — aqui só reaproveitamos o mesmo refresh de
          // tenantSummary já usado no caminho de importação concluída.
          onCreditsConsumed={() => onImportStudents?.(0)}
          onImportComplete={(importedCount) => {
            setShowImportModal(false);
            onImportStudents?.(importedCount);
          }}
        />
      )}
    </div>
  );
};

// ── Shared: student status flags ───────────────────────────────────────────────
function studentStatus(s: Student) {
  const basicStatus          = getStudentBasicCompletionStatus(s);
  const isTriagem            = s.tipo_aluno === 'em_triagem';
  const isIncomplete         = basicStatus === 'invalid';
  const isValidBasic         = basicStatus === 'valid_basic';
  const isImportedIncomplete = isIncomplete && s.importSource === 'csv';
  const accentColor = isImportedIncomplete ? '#7F1D1D'
    : isIncomplete  ? C.red
    : isTriagem     ? '#F59E0B'
    : C.petrol;
  const avatarBg = isImportedIncomplete
    ? 'linear-gradient(135deg,#7F1D1D,#B91C1C)'
    : isIncomplete
      ? `linear-gradient(135deg,${C.red},#F87171)`
      : `linear-gradient(135deg,${isTriagem ? '#F59E0B' : C.petrol},${isTriagem ? '#FCD34D' : C.dark})`;
  return { isTriagem, isIncomplete, isImportedIncomplete, isValidBasic, accentColor, avatarBg };
}

// ── Shared: avatar ─────────────────────────────────────────────────────────────
function Avatar({ student: s, size = 44 }: { student: Student; size?: number }) {
  const { avatarBg } = studentStatus(s);
  return (
    <div
      className="rounded-full flex items-center justify-center overflow-hidden shrink-0 font-semibold text-white"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        background: s.photoUrl ? undefined : avatarBg,
      }}
    >
      {s.photoUrl
        ? <img src={s.photoUrl} className="w-full h-full object-cover" alt={s.name} />
        : (s.name ?? '?').charAt(0).toUpperCase()}
    </div>
  );
}

// ── Shared: status badges ──────────────────────────────────────────────────────
function StatusBadges({ student: s }: { student: Student }) {
  const { isTriagem, isIncomplete, isImportedIncomplete } = studentStatus(s);
  const badges: React.ReactNode[] = [];

  if (s.tipo_aluno === 'com_laudo' && !isIncomplete && !isTriagem) {
    badges.push(
      <span key="laudo" className="text-[10px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap"
        style={{ background: C.tealLight, color: C.petrol, border: `1px solid ${C.petrol}30` }}>
        Com Laudo
      </span>
    );
  }
  if (isTriagem) {
    badges.push(
      <span key="triagem" className="text-[10px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap"
        style={{ background: '#FFFBEB', color: '#92400E', border: '1px solid #FDE68A' }}>
        Em Triagem
      </span>
    );
  }
  if (s.isExternalStudent) {
    badges.push(
      <span key="ext" className="text-[10px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap"
        style={{ background: C.goldLight, color: '#92400E', border: '1px solid #FDE68A' }}>
        Externo
      </span>
    );
  }
  if (isImportedIncomplete) {
    badges.push(
      <span key="csv" className="text-[10px] font-medium px-2 py-0.5 rounded-full flex items-center gap-0.5 whitespace-nowrap"
        style={{ background: '#FEE2E2', color: '#7F1D1D', border: '1px solid #B91C1C40' }}>
        <Upload size={9} /> CSV incompleto
      </span>
    );
  } else if (isIncomplete) {
    badges.push(
      <span key="inc" className="text-[10px] font-medium px-2 py-0.5 rounded-full flex items-center gap-0.5 whitespace-nowrap"
        style={{ background: C.redLight, color: C.red, border: `1px solid ${C.red}40` }}>
        <AlertCircle size={9} /> Incompleto
      </span>
    );
  }

  return <div className="flex flex-wrap gap-1">{badges}</div>;
}

// ── Shared: info cell (label + value) ─────────────────────────────────────────
function InfoCell({ label, value, span2 = false }: { label: string; value: string; span2?: boolean }) {
  const isEmpty = !value || value === '—';
  return (
    <div style={span2 ? { gridColumn: '1 / -1' } : {}}>
      <p style={{ fontSize: '10px', color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, marginBottom: 2 }}>
        {label}
      </p>
      <p className="truncate" style={{ fontSize: '12px', color: isEmpty ? '#CBD5E1' : C.text, fontWeight: 400 }}>
        {isEmpty ? '—' : value}
      </p>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// VISUALIZAÇÃO QUADRO — StudentGridCard
// ══════════════════════════════════════════════════════════════════════════════
function StudentGridCard({
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
  const { isTriagem, isIncomplete, isImportedIncomplete, accentColor } = studentStatus(s);
  const supportVisual = getStudentSupportVisual(s);
  const diagText = diagnosisText(s);

  const topBarColor = isImportedIncomplete
    ? 'linear-gradient(90deg,#7F1D1D,#DC2626)'
    : isIncomplete
      ? `linear-gradient(90deg,${C.red},#F87171)`
      : isTriagem
        ? 'linear-gradient(90deg,#F59E0B,#FCD34D)'
        : `linear-gradient(90deg,${C.petrol},${C.dark})`;

  return (
    <div
      className="rounded-2xl cursor-pointer group flex flex-col transition-all duration-150"
      style={{
        background: C.surface,
        border: `1px solid ${isIncomplete ? accentColor + '40' : C.border}`,
        boxShadow: '0 1px 4px rgba(15,23,42,0.04)',
      }}
      onClick={() => onSelect(s)}
      onMouseEnter={e => {
        (e.currentTarget as HTMLDivElement).style.borderColor = isIncomplete ? accentColor : C.petrol + '55';
        (e.currentTarget as HTMLDivElement).style.boxShadow = '0 6px 20px rgba(15,23,42,0.10)';
        (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-1px)';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLDivElement).style.borderColor = isIncomplete ? accentColor + '40' : C.border;
        (e.currentTarget as HTMLDivElement).style.boxShadow = '0 1px 4px rgba(15,23,42,0.04)';
        (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)';
      }}
    >
      {/* Top color bar */}
      <div className="h-1 rounded-t-2xl" style={{ background: topBarColor }} />

      <div className="p-4 flex flex-col flex-1">

        {/* Header: avatar + name + support icon */}
        <div className="flex items-start gap-3 mb-3">
          <Avatar student={s} size={44} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <h3
                className="font-semibold text-sm leading-tight"
                style={{
                  color: C.text,
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              >
                {s.name}
              </h3>
              {supportVisual && (
                <span
                  title={supportVisual.tooltip}
                  className="shrink-0 cursor-default select-none leading-none"
                  style={{ display: 'inline-flex', alignItems: 'center', opacity: 0.9, marginTop: 1 }}
                >
                  {supportVisual.icon}
                </span>
              )}
            </div>
            {(s.unique_code || s.registrationDate) && (
              <p style={{ fontSize: 10, color: C.textMuted, marginTop: 3, lineHeight: 1.3 }}>
                {s.unique_code ? `#${s.unique_code}` : ''}
                {s.unique_code && s.registrationDate ? ' · ' : ''}
                {s.registrationDate ? fmtDate(s.registrationDate) : ''}
              </p>
            )}
          </div>
        </div>

        {/* Diagnosis */}
        <div className="mb-2.5">
          <p
            className="text-xs leading-snug"
            style={{
              color: diagText === '—' ? '#CBD5E1' : C.textSec,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
            title={diagText !== '—' ? diagText : undefined}
          >
            {diagText}
          </p>
        </div>

        {/* Badges */}
        <div className="mb-3">
          <StatusBadges student={s} />
        </div>

        {/* Info grid */}
        <div
          className="flex-1 grid gap-x-3 gap-y-2.5 mb-3 pt-3"
          style={{
            gridTemplateColumns: '1fr 1fr',
            borderTop: `1px solid ${C.border}`,
          }}
        >
          <InfoCell label="Série / Ano" value={s.grade || '—'} />
          <InfoCell label="Turno"       value={s.shift || '—'} />
          <InfoCell label="Aniversário" value={fmtBirthDate(s.birthDate)} />
          <InfoCell label="Telefone"    value={guardianPhone(s)} />
          <InfoCell label="Responsável" value={guardianName(s)} span2 />
        </div>

        {/* Footer actions */}
        <div
          className="flex items-center justify-between pt-3"
          style={{ borderTop: `1px solid ${C.border}` }}
        >
          <button
            onClick={e => { e.stopPropagation(); onSelect(s); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition"
            style={{ background: C.tealLight, color: C.petrol }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = C.petrol; (e.currentTarget as HTMLButtonElement).style.color = '#fff'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = C.tealLight; (e.currentTarget as HTMLButtonElement).style.color = C.petrol; }}
          >
            <Eye size={12} /> Ver detalhes
          </button>

          <div className="flex gap-1">
            <button
              onClick={e => { e.stopPropagation(); onEdit(s); }}
              className="p-1.5 rounded-lg transition"
              title="Editar"
              style={{ color: '#CBD5E1' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = C.petrol + '14'; (e.currentTarget as HTMLButtonElement).style.color = C.petrol; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = '#CBD5E1'; }}
            >
              <Edit size={14} />
            </button>
            <button
              onClick={e => { e.stopPropagation(); onDelete(s.id); }}
              className="p-1.5 rounded-lg transition"
              title="Excluir"
              style={{ color: '#CBD5E1' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#FEF2F2'; (e.currentTarget as HTMLButtonElement).style.color = '#EF4444'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = '#CBD5E1'; }}
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// VISUALIZAÇÃO LISTA — StudentListView + StudentListRow
// ══════════════════════════════════════════════════════════════════════════════
function StudentListView({
  students,
  onSelect,
  onEdit,
  onDelete,
}: {
  students: Student[];
  onSelect: (s: Student) => void;
  onEdit: (s: Student) => void;
  onDelete: (id: string) => void;
}) {
  const TH: React.CSSProperties = {
    padding: '10px 14px',
    textAlign: 'left',
    fontSize: 10,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: C.textMuted,
    whiteSpace: 'nowrap',
    background: '#F8F9FA',
    borderBottom: `1px solid ${C.border}`,
  };

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ border: `1px solid ${C.border}`, boxShadow: '0 1px 6px rgba(15,23,42,0.04)' }}
    >
      <div className="overflow-x-auto">
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
          <thead>
            <tr>
              <th style={{ ...TH, paddingLeft: 20, minWidth: 230 }}>Aluno</th>
              <th style={{ ...TH, minWidth: 130 }}>Status</th>
              <th style={{ ...TH, minWidth: 80 }}>Série</th>
              <th style={{ ...TH, minWidth: 80 }}>Turno</th>
              <th style={{ ...TH, minWidth: 130 }}>Aniversário</th>
              <th style={{ ...TH, minWidth: 120 }}>Telefone</th>
              <th style={{ ...TH, minWidth: 140 }}>Responsável</th>
              <th style={{ ...TH, minWidth: 80, textAlign: 'right', paddingRight: 16 }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {students.map((s, i) => (
              <StudentListRow
                key={s.id}
                student={s}
                isLast={i === students.length - 1}
                onSelect={onSelect}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StudentListRow({
  student: s,
  isLast,
  onSelect,
  onEdit,
  onDelete,
}: {
  student: Student;
  isLast: boolean;
  onSelect: (s: Student) => void;
  onEdit: (s: Student) => void;
  onDelete: (id: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const supportVisual = getStudentSupportVisual(s);
  const diagText = diagnosisText(s);

  const TD: React.CSSProperties = {
    padding: '12px 14px',
    fontSize: 13,
    color: C.text,
    borderBottom: isLast ? 'none' : `1px solid ${C.border}`,
    verticalAlign: 'middle',
    background: hovered ? '#F8FCFD' : C.surface,
    transition: 'background 0.12s',
  };

  const muted: React.CSSProperties = { color: '#CBD5E1' };

  return (
    <tr
      style={{ cursor: 'pointer' }}
      onClick={() => onSelect(s)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Aluno */}
      <td style={{ ...TD, paddingLeft: 20 }}>
        <div className="flex items-center gap-3">
          <Avatar student={s} size={36} />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span
                className="font-medium text-sm truncate"
                style={{ color: C.text, maxWidth: 170, display: 'inline-block' }}
                title={s.name}
              >
                {s.name}
              </span>
              {supportVisual && (
                <span title={supportVisual.tooltip} style={{ display: 'inline-flex', alignItems: 'center', opacity: 0.85, flexShrink: 0 }}>
                  {supportVisual.icon}
                </span>
              )}
            </div>
            {diagText !== '—' && (
              <p
                className="text-xs truncate"
                style={{ color: C.textSec, maxWidth: 200, marginTop: 1 }}
                title={diagText}
              >
                {diagText}
              </p>
            )}
            {(s.unique_code || s.registrationDate) && (
              <p style={{ fontSize: 10, color: C.textMuted, marginTop: 2 }}>
                {s.unique_code ? `#${s.unique_code}` : ''}
                {s.unique_code && s.registrationDate ? ' · ' : ''}
                {s.registrationDate ? fmtDate(s.registrationDate) : ''}
              </p>
            )}
          </div>
        </div>
      </td>

      {/* Status badges */}
      <td style={TD}>
        <StatusBadges student={s} />
      </td>

      {/* Série */}
      <td style={TD}>
        <span style={s.grade ? {} : muted}>{s.grade || '—'}</span>
      </td>

      {/* Turno */}
      <td style={TD}>
        <span style={s.shift ? {} : muted}>{s.shift || '—'}</span>
      </td>

      {/* Aniversário */}
      <td style={TD}>
        <span className="text-xs whitespace-nowrap" style={{ color: C.textSec }}>
          {fmtBirthDate(s.birthDate)}
        </span>
      </td>

      {/* Telefone */}
      <td style={TD}>
        {(() => {
          const phone = guardianPhone(s);
          return <span className="text-xs" style={phone === '—' ? muted : { color: C.textSec }}>{phone}</span>;
        })()}
      </td>

      {/* Responsável */}
      <td style={TD}>
        {(() => {
          const gn = guardianName(s);
          return (
            <span
              className="text-xs truncate"
              style={{ color: gn === '—' ? '#CBD5E1' : C.textSec, maxWidth: 140, display: 'inline-block' }}
              title={gn !== '—' ? gn : undefined}
            >
              {gn}
            </span>
          );
        })()}
      </td>

      {/* Ações */}
      <td style={{ ...TD, textAlign: 'right', paddingRight: 16 }}>
        <div className="flex items-center justify-end gap-1">
          <button
            onClick={e => { e.stopPropagation(); onSelect(s); }}
            className="p-1.5 rounded-lg transition"
            title="Ver detalhes"
            style={{ color: '#CBD5E1' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = C.tealLight; (e.currentTarget as HTMLButtonElement).style.color = C.petrol; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = '#CBD5E1'; }}
          >
            <Eye size={14} />
          </button>
          <button
            onClick={e => { e.stopPropagation(); onEdit(s); }}
            className="p-1.5 rounded-lg transition"
            title="Editar"
            style={{ color: '#CBD5E1' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = C.petrol + '14'; (e.currentTarget as HTMLButtonElement).style.color = C.petrol; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = '#CBD5E1'; }}
          >
            <Edit size={14} />
          </button>
          <button
            onClick={e => { e.stopPropagation(); onDelete(s.id); }}
            className="p-1.5 rounded-lg transition"
            title="Excluir"
            style={{ color: '#CBD5E1' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#FEF2F2'; (e.currentTarget as HTMLButtonElement).style.color = '#EF4444'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = '#CBD5E1'; }}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </td>
    </tr>
  );
}
