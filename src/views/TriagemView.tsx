// Sprint 5A — Módulo de Triagem
// Porta de entrada do Estudo de Caso. Módulo próprio com destaque no menu.
import React, { useMemo, useState } from 'react';
import {
  Search, AlertCircle, CheckCircle2, Clock, ArrowRight,
  FileSearch, UserPlus, ChevronRight, Filter, Zap, Eye,
  GraduationCap, Users, XCircle,
} from 'lucide-react';
import { Student, User } from '../types';

const C = {
  bg: '#F6F4EF',
  surface: '#FFFFFF',
  petrol: '#1F4E5F',
  dark: '#2E3A59',
  gold: '#C69214',
  goldLight: '#FDF6E3',
  border: '#E7E2D8',
  muted: '#667085',
  red: '#EF4444',
  amber: '#F59E0B',
  green: '#10B981',
};

// Estágios da triagem — cada aluno avança nessa máquina de estados
export type TriagemStage =
  | 'aguardando_checklist'   // recém-cadastrado
  | 'checklist_preenchido'   // checklist salvo
  | 'em_analise'             // em análise (IA ou manual)
  | 'decisao_pendente'       // aguardando decisão institucional
  | 'concluida_laudo'        // convertido para com_laudo
  | 'concluida_sem_laudo';   // triagem encerrada sem laudo

const STAGE_LABEL: Record<TriagemStage, string> = {
  aguardando_checklist:  'Aguardando Checklist',
  checklist_preenchido:  'Checklist Preenchido',
  em_analise:            'Em Análise',
  decisao_pendente:      'Decisão Pendente',
  concluida_laudo:       'Convertido c/ Laudo',
  concluida_sem_laudo:   'Encerrado s/ Laudo',
};

const STAGE_COLOR: Record<TriagemStage, { bg: string; text: string; border: string }> = {
  aguardando_checklist: { bg: '#FEF3C7', text: '#92400E', border: '#FDE68A' },
  checklist_preenchido: { bg: '#EFF6FF', text: '#1D4ED8', border: '#BFDBFE' },
  em_analise:           { bg: '#F0FDF4', text: '#065F46', border: '#A7F3D0' },
  decisao_pendente:     { bg: '#FFF7ED', text: '#9A3412', border: '#FDBA74' },
  concluida_laudo:      { bg: '#F0FDF4', text: '#166534', border: '#BBF7D0' },
  concluida_sem_laudo:  { bg: '#FEF2F2', text: '#991B1B', border: '#FECACA' },
};

const STAGE_ICON: Record<TriagemStage, React.ReactNode> = {
  aguardando_checklist: <Clock size={12} />,
  checklist_preenchido: <CheckCircle2 size={12} />,
  em_analise:           <Zap size={12} />,
  decisao_pendente:     <AlertCircle size={12} />,
  concluida_laudo:      <GraduationCap size={12} />,
  concluida_sem_laudo:  <XCircle size={12} />,
};

// Derivar estágio atual de um aluno (pode ser refinado com campos futuros)
function deriveStage(s: Student): TriagemStage {
  if (s.tipo_aluno === 'com_laudo') return 'concluida_laudo';
  const obs = (s as any).triagem_stage as TriagemStage | undefined;
  if (obs) return obs;
  const hasFicha = Array.isArray(s.fichasComplementares) && s.fichasComplementares.length > 0;
  if (hasFicha) return 'checklist_preenchido';
  return 'aguardando_checklist';
}

interface TriagemViewProps {
  students: Student[];
  user: User;
  onOpenStudent: (s: Student) => void;
  onStartEnrollment: () => void;
  onOpenEstudoCaso: (s: Student) => void;
  onConvertToLaudo: (s: Student) => void;
}

type FilterStage = 'all' | TriagemStage;

export const TriagemView: React.FC<TriagemViewProps> = ({
  students,
  user,
  onOpenStudent,
  onStartEnrollment,
  onOpenEstudoCaso,
  onConvertToLaudo,
}) => {
  const [search, setSearch] = useState('');
  const [filterStage, setFilterStage] = useState<FilterStage>('all');

  // Apenas alunos em triagem (não inclui com_laudo confirmados, exceto se quiser histórico)
  const triagemStudents = useMemo(() =>
    students.filter(s => s.tipo_aluno === 'em_triagem'),
  [students]);

  const filtered = useMemo(() => {
    return triagemStudents.filter(s => {
      const matchSearch = s.name.toLowerCase().includes(search.toLowerCase()) ||
        (s.diagnosis || []).join(' ').toLowerCase().includes(search.toLowerCase());
      if (!matchSearch) return false;
      if (filterStage !== 'all') return deriveStage(s) === filterStage;
      return true;
    });
  }, [triagemStudents, search, filterStage]);

  const stats = useMemo(() => {
    const stages: Record<TriagemStage, number> = {
      aguardando_checklist: 0,
      checklist_preenchido: 0,
      em_analise:           0,
      decisao_pendente:     0,
      concluida_laudo:      0,
      concluida_sem_laudo:  0,
    };
    triagemStudents.forEach(s => { stages[deriveStage(s)]++; });
    return { total: triagemStudents.length, stages };
  }, [triagemStudents]);

  const FILTER_OPTIONS: { id: FilterStage; label: string; count: number }[] = [
    { id: 'all',                  label: 'Todos',           count: stats.total },
    { id: 'aguardando_checklist', label: 'Aguardando',      count: stats.stages.aguardando_checklist },
    { id: 'checklist_preenchido', label: 'Checklist OK',    count: stats.stages.checklist_preenchido },
    { id: 'em_analise',           label: 'Em Análise',      count: stats.stages.em_analise },
    { id: 'decisao_pendente',     label: 'Dec. Pendente',   count: stats.stages.decisao_pendente },
  ];

  return (
    <div style={{ minHeight: '100vh', background: C.bg, padding: '28px 24px' }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28, flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: `linear-gradient(135deg, ${C.amber}, #FCD34D)`,
              }}>
                <Search size={18} color="#fff" />
              </div>
              <h1 style={{ fontSize: 22, fontWeight: 800, color: C.dark, margin: 0 }}>
                Módulo de Triagem
              </h1>
            </div>
            <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>
              Acompanhe o processo de triagem de cada aluno · Porta de entrada do Estudo de Caso
            </p>
          </div>
          <button
            onClick={onStartEnrollment}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 20px', borderRadius: 10, border: 'none',
              background: `linear-gradient(135deg, ${C.amber}, #D97706)`,
              color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(245,158,11,0.35)',
            }}
          >
            <UserPlus size={15} />
            Nova Triagem
          </button>
        </div>

        {/* ── Estatísticas pipeline ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 28 }}>
          {([
            { label: 'Total em Triagem', value: stats.total, color: C.petrol, bg: '#EFF9FF' },
            { label: 'Aguardando Checklist', value: stats.stages.aguardando_checklist, color: '#92400E', bg: '#FEF3C7' },
            { label: 'Em Análise', value: stats.stages.em_analise + stats.stages.checklist_preenchido, color: '#065F46', bg: '#F0FDF4' },
            { label: 'Decisão Pendente', value: stats.stages.decisao_pendente, color: '#9A3412', bg: '#FFF7ED' },
          ] as const).map((s, i) => (
            <div key={i} style={{
              background: C.surface, borderRadius: 14, padding: '16px 18px',
              border: `1.5px solid ${C.border}`,
              boxShadow: '0 2px 8px rgba(31,78,95,0.05)',
            }}>
              <div style={{ fontSize: 26, fontWeight: 800, color: s.color, marginBottom: 2 }}>{s.value}</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.muted, lineHeight: 1.3 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* ── Pipeline visual ── */}
        <div style={{
          background: C.surface, borderRadius: 14, padding: '16px 20px',
          border: `1.5px solid ${C.border}`, marginBottom: 24,
          display: 'flex', alignItems: 'center', gap: 0, overflowX: 'auto',
        }}>
          {(['aguardando_checklist','checklist_preenchido','em_analise','decisao_pendente'] as TriagemStage[]).map((stage, i, arr) => {
            const count = stats.stages[stage];
            const col = STAGE_COLOR[stage];
            return (
              <React.Fragment key={stage}>
                <button
                  onClick={() => setFilterStage(filterStage === stage ? 'all' : stage)}
                  style={{
                    flex: '1 1 0', minWidth: 100, padding: '10px 8px', borderRadius: 8, border: 'none',
                    background: filterStage === stage ? col.bg : 'transparent',
                    cursor: 'pointer', textAlign: 'center', transition: 'background 0.15s',
                  }}
                >
                  <div style={{ fontSize: 20, fontWeight: 800, color: col.text }}>{count}</div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: C.muted, whiteSpace: 'nowrap' }}>
                    {STAGE_LABEL[stage]}
                  </div>
                </button>
                {i < arr.length - 1 && (
                  <ChevronRight size={14} style={{ color: C.border, flexShrink: 0, margin: '0 2px' }} />
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* ── Busca + filtro ── */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
          <div style={{
            flex: 1, minWidth: 200, display: 'flex', alignItems: 'center', gap: 8,
            background: C.surface, border: `1.5px solid ${C.border}`, borderRadius: 10, padding: '8px 12px',
          }}>
            <Search size={15} style={{ color: C.muted, flexShrink: 0 }} />
            <input
              style={{ flex: 1, border: 'none', outline: 'none', fontSize: 13, color: C.dark, background: 'transparent' }}
              placeholder="Buscar aluno..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', background: C.surface, border: `1.5px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
            {FILTER_OPTIONS.map(opt => (
              <button
                key={opt.id}
                onClick={() => setFilterStage(opt.id)}
                style={{
                  padding: '8px 12px', border: 'none', fontSize: 11, fontWeight: 700,
                  background: filterStage === opt.id ? C.petrol : 'transparent',
                  color: filterStage === opt.id ? '#fff' : C.muted,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap',
                }}
              >
                {opt.label}
                {opt.count > 0 && (
                  <span style={{
                    fontSize: 10, padding: '0 5px', borderRadius: 99,
                    background: filterStage === opt.id ? 'rgba(255,255,255,0.2)' : C.border,
                    color: filterStage === opt.id ? '#fff' : C.muted,
                  }}>
                    {opt.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ── Lista ── */}
        {filtered.length === 0 ? (
          <div style={{
            background: C.surface, borderRadius: 16, padding: '60px 24px',
            border: `2px dashed ${C.border}`, textAlign: 'center',
          }}>
            <Search size={40} style={{ color: C.border, margin: '0 auto 12px' }} />
            <p style={{ fontWeight: 600, color: C.muted, margin: '0 0 4px' }}>
              {search ? 'Nenhum aluno encontrado' : 'Nenhum aluno em triagem'}
            </p>
            <p style={{ fontSize: 12, color: C.border, margin: 0 }}>
              Clique em "Nova Triagem" para iniciar o processo
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map(s => {
              const card = (
                <TriagemCard
                  student={s}
                  stage={deriveStage(s)}
                  onOpen={() => onOpenStudent(s)}
                  onEstudoCaso={() => onOpenEstudoCaso(s)}
                  onConvert={() => onConvertToLaudo(s)}
                />
              );
              return React.cloneElement(card, { key: s.id });
            })}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Card individual ──────────────────────────────────────────────────────────
function TriagemCard({
  student: s,
  stage,
  onOpen,
  onEstudoCaso,
  onConvert,
}: {
  student: Student;
  stage: TriagemStage;
  onOpen: () => void;
  onEstudoCaso: () => void;
  onConvert: () => void;
}) {
  const stageCol = STAGE_COLOR[stage];
  const isConcluded = stage === 'concluida_laudo' || stage === 'concluida_sem_laudo';

  return (
    <div style={{
      background: C.surface, borderRadius: 14, border: `1.5px solid ${C.border}`,
      boxShadow: '0 2px 8px rgba(31,78,95,0.04)', overflow: 'hidden',
      display: 'flex', alignItems: 'stretch',
    }}>
      {/* Faixa lateral de status */}
      <div style={{
        width: 5, flexShrink: 0,
        background: stage === 'aguardando_checklist' ? C.amber :
                    stage === 'checklist_preenchido'  ? '#3B82F6' :
                    stage === 'em_analise'             ? C.green :
                    stage === 'decisao_pendente'       ? '#F97316' :
                    stage === 'concluida_laudo'        ? C.green : C.red,
      }} />

      <div style={{ flex: 1, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        {/* Avatar */}
        <div style={{
          width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
          background: `linear-gradient(135deg, ${C.amber}, #FCD34D)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 800, fontSize: 16, color: '#fff',
        }}>
          {s.name.charAt(0).toUpperCase()}
        </div>

        {/* Info principal */}
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: C.dark, marginBottom: 2 }}>{s.name}</div>
          <div style={{ fontSize: 11, color: C.muted }}>
            {s.grade || 'Série não informada'}
            {s.birthDate ? ` · ${s.birthDate}` : ''}
          </div>
          {(s.diagnosis || []).length > 0 && (
            <div style={{ fontSize: 10, color: C.petrol, marginTop: 2 }}>
              {s.diagnosis.slice(0, 2).join(', ')}
            </div>
          )}
        </div>

        {/* Badge de estágio */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 4,
          padding: '4px 10px', borderRadius: 99, fontSize: 10, fontWeight: 700,
          background: stageCol.bg, color: stageCol.text, border: `1px solid ${stageCol.border}`,
          flexShrink: 0,
        }}>
          {STAGE_ICON[stage]}
          {STAGE_LABEL[stage]}
        </div>

        {/* Ações */}
        {!isConcluded && (
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <button
              onClick={onEstudoCaso}
              title="Iniciar Estudo de Caso"
              style={{
                display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px',
                borderRadius: 8, border: `1.5px solid ${C.petrol}`, background: 'transparent',
                color: C.petrol, fontSize: 11, fontWeight: 700, cursor: 'pointer',
              }}
            >
              <FileSearch size={13} /> Estudo de Caso
            </button>
            <button
              onClick={onOpen}
              title="Ver ficha do aluno"
              style={{
                display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px',
                borderRadius: 8, border: 'none', background: C.petrol,
                color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer',
              }}
            >
              <Eye size={13} /> Ver Ficha
            </button>
          </div>
        )}

        {isConcluded && (
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <button
              onClick={onOpen}
              style={{
                display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px',
                borderRadius: 8, border: 'none', background: C.petrol,
                color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer',
              }}
            >
              <Eye size={13} /> Ver Ficha <ArrowRight size={11} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
