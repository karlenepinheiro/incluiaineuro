// Sprint 5A — EnrollmentWizard
// Fluxo guiado de matrícula: 4 etapas obrigatórias
// Dados → Checklist de Observação → Análise → Finalizar + documentos automáticos
import React, { useState, useCallback } from 'react';
import {
  X, ChevronRight, ChevronLeft, CheckCircle2, User, ClipboardList,
  Brain, FileDown, AlertCircle, Download, Loader2, BookOpen, Sparkles,
} from 'lucide-react';
import { Student, User as UserType, SchoolConfig, PriorKnowledgeProfile } from '../types';
import { PDFGenerator } from '../services/PDFGenerator';

const C = {
  bg:       '#F6F4EF',
  surface:  '#FFFFFF',
  petrol:   '#1F4E5F',
  dark:     '#2E3A59',
  gold:     '#C69214',
  border:   '#E7E2D8',
  muted:    '#667085',
  amber:    '#F59E0B',
  green:    '#10B981',
  red:      '#EF4444',
};

// ─── Checklist de observação comportamental ─────────────────────────────────
export interface ChecklistItem {
  id: string;
  category: string;
  label: string;
  checked: boolean;
}

const CHECKLIST_TEMPLATE: Omit<ChecklistItem, 'checked'>[] = [
  // Atenção & Concentração
  { id: 'atc1', category: 'Atenção & Concentração', label: 'Dificuldade em manter atenção por períodos prolongados' },
  { id: 'atc2', category: 'Atenção & Concentração', label: 'Distrai-se facilmente com estímulos externos' },
  { id: 'atc3', category: 'Atenção & Concentração', label: 'Não conclui tarefas iniciadas' },
  { id: 'atc4', category: 'Atenção & Concentração', label: 'Apresenta hiperfoco em interesses específicos' },
  // Linguagem & Comunicação
  { id: 'lng1', category: 'Linguagem & Comunicação', label: 'Dificuldade na expressão oral' },
  { id: 'lng2', category: 'Linguagem & Comunicação', label: 'Atraso na aquisição da linguagem' },
  { id: 'lng3', category: 'Linguagem & Comunicação', label: 'Dificuldade na compreensão de enunciados complexos' },
  { id: 'lng4', category: 'Linguagem & Comunicação', label: 'Comunicação não-verbal predominante' },
  { id: 'lng5', category: 'Linguagem & Comunicação', label: 'Ecolalia (repetição de palavras/frases)' },
  // Aprendizagem
  { id: 'apr1', category: 'Aprendizagem', label: 'Dificuldade na leitura e decodificação' },
  { id: 'apr2', category: 'Aprendizagem', label: 'Dificuldade na escrita / disgrafía' },
  { id: 'apr3', category: 'Aprendizagem', label: 'Dificuldade com operações matemáticas' },
  { id: 'apr4', category: 'Aprendizagem', label: 'Ritmo de aprendizagem muito abaixo da média da turma' },
  { id: 'apr5', category: 'Aprendizagem', label: 'Não reconhece letras ou números conforme esperado para a série' },
  // Comportamento & Socialização
  { id: 'soc1', category: 'Comportamento & Socialização', label: 'Dificuldade em interagir com pares' },
  { id: 'soc2', category: 'Comportamento & Socialização', label: 'Comportamento agressivo ou autolesivo' },
  { id: 'soc3', category: 'Comportamento & Socialização', label: 'Isolamento social frequente' },
  { id: 'soc4', category: 'Comportamento & Socialização', label: 'Resistência a mudanças de rotina' },
  { id: 'soc5', category: 'Comportamento & Socialização', label: 'Choro frequente sem causa aparente' },
  // Motor
  { id: 'mtr1', category: 'Coordenação Motora', label: 'Dificuldade na coordenação motora fina' },
  { id: 'mtr2', category: 'Coordenação Motora', label: 'Dificuldade na coordenação motora grossa' },
  { id: 'mtr3', category: 'Coordenação Motora', label: 'Hipotonia ou hipertonia muscular observada' },
  { id: 'mtr4', category: 'Coordenação Motora', label: 'Dificuldade com pega do lápis / instrumentos' },
  // Sensorial
  { id: 'sns1', category: 'Processamento Sensorial', label: 'Hipersensibilidade a sons, luzes ou texturas' },
  { id: 'sns2', category: 'Processamento Sensorial', label: 'Busca constante por estímulos sensoriais' },
  { id: 'sns3', category: 'Processamento Sensorial', label: 'Rejeição ao toque físico' },
];

const CHECKLIST_CATEGORIES = [...new Set(CHECKLIST_TEMPLATE.map(i => i.category))];

// Escores do perfil pedagógico (0 = não preenchido)
type PKScore = 0 | 1 | 2 | 3 | 4 | 5;

interface WizardPriorKnowledge {
  leitura_score: PKScore; leitura_notes: string;
  escrita_score: PKScore; escrita_notes: string;
  entendimento_score: PKScore; entendimento_notes: string;
  autonomia_score: PKScore; autonomia_notes: string;
  atencao_score: PKScore; atencao_notes: string;
  raciocinio_score: PKScore; raciocinio_notes: string;
  observacoes_pedagogicas: string;
}

const EMPTY_PK: WizardPriorKnowledge = {
  leitura_score: 0, leitura_notes: '',
  escrita_score: 0, escrita_notes: '',
  entendimento_score: 0, entendimento_notes: '',
  autonomia_score: 0, autonomia_notes: '',
  atencao_score: 0, atencao_notes: '',
  raciocinio_score: 0, raciocinio_notes: '',
  observacoes_pedagogicas: '',
};

// ─── Tipos ──────────────────────────────────────────────────────────────────
interface WizardData {
  // Step 0
  name: string;
  birthDate: string;
  gender: string;
  guardianName: string;
  guardianPhone: string;
  guardianEmail: string;
  grade: string;
  shift: string;
  schoolName: string;
  regentTeacher: string;
  tipo_aluno: 'em_triagem' | 'com_laudo';
  // Step 1 — Perfil Pedagógico Inicial
  priorKnowledge: WizardPriorKnowledge;
  // Step 2
  checklist: ChecklistItem[];
  checklistObs: string;
  // Step 3
  analiseManual: string;
  analiseIA: string;
  // Step 4
  docs: { termo: boolean; declaracao: boolean; compromisso: boolean };
}

interface EnrollmentWizardProps {
  user: UserType;
  initialTipo?: 'em_triagem' | 'com_laudo';
  onSave: (student: Partial<Student>, checklist: ChecklistItem[], analise: string) => Promise<Student>;
  onClose: () => void;
}

// ─── Step labels ─────────────────────────────────────────────────────────────
const STEPS = [
  { label: 'Identificação', icon: User },
  { label: 'Perfil Inicial', icon: BookOpen },
  { label: 'Checklist', icon: ClipboardList },
  { label: 'Análise', icon: Brain },
  { label: 'Finalizar', icon: FileDown },
];

// ─── Main component ───────────────────────────────────────────────────────────
export const EnrollmentWizard: React.FC<EnrollmentWizardProps> = ({
  user,
  initialTipo = 'em_triagem',
  onSave,
  onClose,
}) => {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [savedStudent, setSavedStudent] = useState<Student | null>(null);
  const [generatingDocs, setGeneratingDocs] = useState(false);
  const [docsReady, setDocsReady] = useState<{ nome: string; blob: Blob }[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [data, setData] = useState<WizardData>({
    name: '', birthDate: '', gender: '', guardianName: '', guardianPhone: '',
    guardianEmail: '', grade: '', shift: 'Manhã', schoolName: user.schoolConfigs?.[0]?.schoolName || '',
    regentTeacher: '', tipo_aluno: initialTipo,
    priorKnowledge: { ...EMPTY_PK },
    checklist: CHECKLIST_TEMPLATE.map(i => ({ ...i, checked: false })),
    checklistObs: '', analiseManual: '', analiseIA: '',
    docs: { termo: true, declaracao: true, compromisso: true },
  });

  const set = useCallback(<K extends keyof WizardData>(k: K, v: WizardData[K]) => {
    setData(prev => ({ ...prev, [k]: v }));
  }, []);

  const toggleCheck = (id: string) => {
    set('checklist', data.checklist.map(i => i.id === id ? { ...i, checked: !i.checked } : i));
  };

  const checkedCount = data.checklist.filter(i => i.checked).length;
  const pkFilledCount = PK_DIMENSIONS.filter(d => (data.priorKnowledge as any)[d.scoreKey] > 0).length;
  const pkIsIncomplete = pkFilledCount === 0;

  // ── Validações por step ──
  const canProceed = [
    data.name.trim().length >= 2 && data.guardianName.trim().length >= 2 && data.guardianPhone.trim().length >= 8,
    true, // perfil pedagógico é opcional
    true, // checklist é opcional (observação livre)
    true, // análise também opcional
    true,
  ][step];

  // ── Salvar e gerar documentos (step 4) ──
  const handleFinish = async () => {
    setSaving(true);
    setError(null);
    try {
      // Converter WizardPriorKnowledge (scores 0=vazio) → PriorKnowledgeProfile
      const pk = data.priorKnowledge;
      const hasPK = pk.leitura_score > 0 || pk.escrita_score > 0 || pk.entendimento_score > 0 ||
                    pk.autonomia_score > 0 || pk.atencao_score > 0 || pk.raciocinio_score > 0;
      const priorKnowledgePayload: PriorKnowledgeProfile | undefined = hasPK ? {
        leitura_score:      pk.leitura_score      > 0 ? pk.leitura_score      as 1|2|3|4|5 : undefined,
        leitura_notes:      pk.leitura_notes      || undefined,
        escrita_score:      pk.escrita_score      > 0 ? pk.escrita_score      as 1|2|3|4|5 : undefined,
        escrita_notes:      pk.escrita_notes      || undefined,
        entendimento_score: pk.entendimento_score > 0 ? pk.entendimento_score as 1|2|3|4|5 : undefined,
        entendimento_notes: pk.entendimento_notes || undefined,
        autonomia_score:    pk.autonomia_score    > 0 ? pk.autonomia_score    as 1|2|3|4|5 : undefined,
        autonomia_notes:    pk.autonomia_notes    || undefined,
        atencao_score:      pk.atencao_score      > 0 ? pk.atencao_score      as 1|2|3|4|5 : undefined,
        atencao_notes:      pk.atencao_notes      || undefined,
        raciocinio_score:   pk.raciocinio_score   > 0 ? pk.raciocinio_score   as 1|2|3|4|5 : undefined,
        raciocinio_notes:   pk.raciocinio_notes   || undefined,
        observacoes_pedagogicas: pk.observacoes_pedagogicas || undefined,
        registeredAt: new Date().toISOString(),
        registeredBy: user.name || undefined,
      } : undefined;

      const studentData: Partial<Student> = {
        name: data.name,
        birthDate: data.birthDate,
        gender: data.gender,
        guardianName: data.guardianName,
        guardianPhone: data.guardianPhone,
        guardianEmail: data.guardianEmail,
        grade: data.grade,
        shift: data.shift,
        schoolName: data.schoolName,
        regentTeacher: data.regentTeacher,
        tipo_aluno: data.tipo_aluno,
        observations: data.analiseManual,
        priorKnowledge: priorKnowledgePayload,
        registrationDate: new Date().toISOString().split('T')[0],
        diagnosis: [],
        cid: [],
        supportLevel: '',
        medication: '',
        professionals: [],
        schoolHistory: '',
        abilities: [],
        difficulties: [],
        strategies: [],
        communication: [],
      };
      const saved = await onSave(studentData, data.checklist, data.analiseManual);
      setSavedStudent(saved);
      // Gerar documentos automáticos
      await handleGenerateDocs(saved);
    } catch (e: any) {
      setError(e?.message || 'Erro ao salvar aluno');
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateDocs = async (student: Student) => {
    setGeneratingDocs(true);
    const school = user.schoolConfigs?.[0] ?? null;
    const blobs: { nome: string; blob: Blob }[] = [];

    try {
      if (data.docs.termo) {
        const blob = await PDFGenerator.generateMatriculaDoc('termo_aee', student, user, school);
        blobs.push({ nome: `Termo_AEE_${student.name.replace(/\s+/g, '_')}.pdf`, blob });
      }
      if (data.docs.declaracao) {
        const blob = await PDFGenerator.generateMatriculaDoc('declaracao_matricula_srm', student, user, school);
        blobs.push({ nome: `Declaracao_Matricula_SRM_${student.name.replace(/\s+/g, '_')}.pdf`, blob });
      }
      if (data.docs.compromisso) {
        const blob = await PDFGenerator.generateMatriculaDoc('declaracao_compromisso', student, user, school);
        blobs.push({ nome: `Declaracao_Compromisso_${student.name.replace(/\s+/g, '_')}.pdf`, blob });
      }
      setDocsReady(blobs);
    } catch (e) {
      console.error('Erro ao gerar documentos automáticos:', e);
    } finally {
      setGeneratingDocs(false);
    }
  };

  const downloadDoc = (item: { nome: string; blob: Blob }) => {
    PDFGenerator.download(item.blob, item.nome);
  };

  // ── Render steps ─────────────────────────────────────────────────────────
  const renderStep = () => {
    switch (step) {
      case 0: return <StepIdentificacao data={data} set={set} />;
      case 1: return <StepPerfilPedagogico data={data} set={set} />;
      case 2: return <StepChecklist data={data} toggleCheck={toggleCheck} set={set} checkedCount={checkedCount} />;
      case 3: return <StepAnalise data={data} set={set} checkedCount={checkedCount} />;
      case 4: return (
        <StepFinalizar
          data={data} set={set} saving={saving} savedStudent={savedStudent}
          generatingDocs={generatingDocs} docsReady={docsReady}
          onDownload={downloadDoc} onFinish={handleFinish} error={error}
          pkIsIncomplete={pkIsIncomplete} pkFilledCount={pkFilledCount}
          onGoToProfile={() => setStep(1)}
        />
      );
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(28,32,46,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16,
    }}>
      <div style={{
        background: C.surface, borderRadius: 20, width: '100%', maxWidth: 680,
        maxHeight: '95vh', overflow: 'hidden', display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 80px rgba(28,32,46,0.35)',
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px 16px', borderBottom: `1px solid ${C.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
        }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: C.dark, margin: '0 0 2px' }}>
              {data.tipo_aluno === 'em_triagem' ? 'Nova Triagem' : 'Matrícula com Laudo'}
            </h2>
            <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>
              Etapa {step + 1} de {STEPS.length} — {STEPS[step].label}
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, padding: 4 }}>
            <X size={20} />
          </button>
        </div>

        {/* Progress Steps */}
        <div style={{
          padding: '14px 24px', borderBottom: `1px solid ${C.border}`, flexShrink: 0,
          display: 'flex', alignItems: 'center', gap: 0,
        }}>
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const done    = i < step;
            const active  = i === step;
            // Step 1 (Perfil Inicial) foi pulado sem preencher
            const warning = done && i === 1 && pkIsIncomplete;
            const bgColor = warning ? C.amber : done ? C.green : active ? C.petrol : C.border;
            const lblColor = active ? C.petrol : warning ? '#92400E' : done ? C.green : C.muted;
            return (
              <React.Fragment key={i}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: bgColor, marginBottom: 4, transition: 'background 0.2s',
                  }}>
                    {done && !warning ? <CheckCircle2 size={16} color="#fff" /> : <Icon size={15} color={active || done ? '#fff' : C.muted} />}
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 600, color: lblColor, whiteSpace: 'nowrap' }}>
                    {warning ? 'Incompleto' : s.label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div style={{
                    height: 2, flex: 1, maxWidth: 40, marginBottom: 16,
                    background: i < step ? (i === 1 && pkIsIncomplete ? C.amber : C.green) : C.border,
                    transition: 'background 0.3s',
                  }} />
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* Conteúdo do step */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          {renderStep()}
        </div>

        {/* Footer navigation */}
        {!(step === STEPS.length - 1 && (savedStudent || saving)) && (
          <div style={{
            padding: '14px 24px', borderTop: `1px solid ${C.border}`, flexShrink: 0,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <button
              onClick={() => step === 0 ? onClose() : setStep(s => s - 1)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px',
                borderRadius: 9, border: `1.5px solid ${C.border}`,
                background: 'transparent', color: C.muted, fontWeight: 600, fontSize: 13, cursor: 'pointer',
              }}
            >
              <ChevronLeft size={15} />
              {step === 0 ? 'Cancelar' : 'Voltar'}
            </button>

            {step < STEPS.length - 1 ? (
              <button
                onClick={() => setStep(s => s + 1)}
                disabled={!canProceed}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '9px 22px',
                  borderRadius: 9, border: 'none',
                  background: canProceed ? `linear-gradient(135deg, ${C.petrol}, ${C.dark})` : C.border,
                  color: canProceed ? '#fff' : C.muted,
                  fontWeight: 700, fontSize: 13, cursor: canProceed ? 'pointer' : 'not-allowed',
                }}
              >
                Próximo <ChevronRight size={15} />
              </button>
            ) : (
              <button
                onClick={handleFinish}
                disabled={saving || !!savedStudent}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '9px 22px',
                  borderRadius: 9, border: 'none',
                  background: saving || savedStudent ? C.green : `linear-gradient(135deg, ${C.amber}, #D97706)`,
                  color: '#fff', fontWeight: 700, fontSize: 13,
                  cursor: saving || savedStudent ? 'default' : 'pointer',
                }}
              >
                {saving ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Salvando…</> :
                 savedStudent ? <><CheckCircle2 size={14} /> Salvo!</> :
                 <>Finalizar Matrícula <ChevronRight size={15} /></>}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Step 1: Identificação ───────────────────────────────────────────────────
function StepIdentificacao({ data, set }: { data: WizardData; set: any }) {
  const field = (label: string, key: keyof WizardData, type = 'text', required = false) => (
    <div style={{ marginBottom: 14 }}>
      <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, display: 'block', marginBottom: 4 }}>
        {label}{required && <span style={{ color: C.red }}> *</span>}
      </label>
      <input
        type={type}
        value={data[key] as string}
        onChange={e => set(key, e.target.value)}
        style={{
          width: '100%', padding: '9px 12px', borderRadius: 9, fontSize: 13,
          border: `1.5px solid ${C.border}`, outline: 'none', color: C.dark,
          boxSizing: 'border-box',
        }}
      />
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
        <button
          onClick={() => set('tipo_aluno', 'em_triagem')}
          style={{
            flex: 1, padding: '10px', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 12,
            border: `2px solid ${data.tipo_aluno === 'em_triagem' ? C.amber : C.border}`,
            background: data.tipo_aluno === 'em_triagem' ? '#FFFBEB' : C.surface,
            color: data.tipo_aluno === 'em_triagem' ? '#92400E' : C.muted,
          }}
        >
          🔍 Em Triagem
        </button>
        <button
          onClick={() => set('tipo_aluno', 'com_laudo')}
          style={{
            flex: 1, padding: '10px', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 12,
            border: `2px solid ${data.tipo_aluno === 'com_laudo' ? C.petrol : C.border}`,
            background: data.tipo_aluno === 'com_laudo' ? '#EFF9FF' : C.surface,
            color: data.tipo_aluno === 'com_laudo' ? C.petrol : C.muted,
          }}
        >
          📋 Com Laudo
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
        <div style={{ gridColumn: '1 / -1' }}>{field('Nome Completo do Aluno', 'name', 'text', true)}</div>
        {field('Data de Nascimento', 'birthDate', 'date')}
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, display: 'block', marginBottom: 4 }}>Gênero</label>
          <select
            value={data.gender}
            onChange={e => set('gender', e.target.value)}
            style={{ width: '100%', padding: '9px 12px', borderRadius: 9, fontSize: 13, border: `1.5px solid ${C.border}`, outline: 'none', color: C.dark }}
          >
            <option value="">Selecionar</option>
            <option>Masculino</option>
            <option>Feminino</option>
            <option>Não-binário</option>
            <option>Prefiro não informar</option>
          </select>
        </div>
        {field('Série / Turma', 'grade')}
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, display: 'block', marginBottom: 4 }}>Turno</label>
          <select
            value={data.shift}
            onChange={e => set('shift', e.target.value)}
            style={{ width: '100%', padding: '9px 12px', borderRadius: 9, fontSize: 13, border: `1.5px solid ${C.border}`, outline: 'none', color: C.dark }}
          >
            <option>Manhã</option>
            <option>Tarde</option>
            <option>Integral</option>
            <option>Noite</option>
          </select>
        </div>
        {field('Professor(a) Regente', 'regentTeacher')}
        {field('Nome do Responsável', 'guardianName', 'text', true)}
        {field('Telefone do Responsável', 'guardianPhone', 'tel', true)}
        {field('E-mail do Responsável', 'guardianEmail', 'email')}
      </div>
    </div>
  );
}

// ─── Step 1: Perfil Pedagógico Inicial ───────────────────────────────────────
const PK_SCALE_LABELS: Record<number, { label: string; color: string }> = {
  1: { label: 'Muito inicial',            color: '#EF4444' },
  2: { label: 'Inicial',                  color: '#F97316' },
  3: { label: 'Em desenvolvimento',       color: '#EAB308' },
  4: { label: 'Adequado para a etapa',    color: '#22C55E' },
  5: { label: 'Avançado para a etapa',    color: '#0EA5E9' },
};

const PK_DIMENSIONS = [
  { scoreKey: 'leitura_score',      notesKey: 'leitura_notes',      label: 'Nível de leitura',                      icon: '📖' },
  { scoreKey: 'escrita_score',      notesKey: 'escrita_notes',      label: 'Nível de escrita',                      icon: '✏️' },
  { scoreKey: 'entendimento_score', notesKey: 'entendimento_notes', label: 'Compreensão / Entendimento',            icon: '🧠' },
  { scoreKey: 'autonomia_score',    notesKey: 'autonomia_notes',    label: 'Autonomia na realização de atividades', icon: '🙌' },
  { scoreKey: 'atencao_score',      notesKey: 'atencao_notes',      label: 'Atenção durante atividades',            icon: '🎯' },
  { scoreKey: 'raciocinio_score',   notesKey: 'raciocinio_notes',   label: 'Raciocínio lógico-matemático',          icon: '🔢' },
] as const;

function StepPerfilPedagogico({ data, set }: { data: WizardData; set: any }) {
  const pk = data.priorKnowledge;

  const setScore = (key: string, val: PKScore) => {
    set('priorKnowledge', { ...pk, [key]: val });
  };
  const setNotes = (key: string, val: string) => {
    set('priorKnowledge', { ...pk, [key]: val });
  };

  const filledCount = PK_DIMENSIONS.filter(d => (pk as any)[d.scoreKey] > 0).length;

  return (
    <div>
      {/* Header informativo */}
      <div style={{
        background: '#EFF9FF', border: '1px solid #BAE6FD', borderRadius: 10,
        padding: '10px 14px', marginBottom: 18, display: 'flex', alignItems: 'flex-start', gap: 10,
      }}>
        <BookOpen size={16} style={{ color: C.petrol, flexShrink: 0, marginTop: 1 }} />
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.petrol }}>Perfil Pedagógico Inicial</div>
          <div style={{ fontSize: 11, color: '#0369A1', marginTop: 2 }}>
            Registre o nível atual do aluno em cada área. Esses dados guiarão a IA na geração de atividades, PEI e relatórios coerentes com o nível real do aluno. Etapa opcional, mas altamente recomendada.
          </div>
        </div>
      </div>

      <div style={{ fontSize: 11, color: C.muted, marginBottom: 14 }}>
        {filledCount} de {PK_DIMENSIONS.length} áreas preenchidas
        {filledCount > 0 && <span style={{ color: C.green, fontWeight: 600 }}> ✓</span>}
      </div>

      {PK_DIMENSIONS.map(dim => {
        const score = (pk as any)[dim.scoreKey] as PKScore;
        const notes = (pk as any)[dim.notesKey] as string;
        return (
          <div key={dim.scoreKey} style={{
            borderRadius: 10, border: `1.5px solid ${score > 0 ? '#BAE6FD' : C.border}`,
            padding: '12px 14px', marginBottom: 12,
            background: score > 0 ? '#F0F9FF' : C.surface,
            transition: 'all 0.15s',
          }}>
            {/* Linha de score */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 16 }}>{dim.icon}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: C.dark, flex: 1 }}>{dim.label}</span>
              {score > 0 && (
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                  background: PK_SCALE_LABELS[score].color + '20',
                  color: PK_SCALE_LABELS[score].color,
                }}>
                  {PK_SCALE_LABELS[score].label}
                </span>
              )}
            </div>

            {/* Botões de escala */}
            <div style={{ display: 'flex', gap: 6, marginBottom: score > 0 ? 10 : 0 }}>
              {([1, 2, 3, 4, 5] as const).map(n => (
                <button
                  key={n}
                  onClick={() => setScore(dim.scoreKey, score === n ? 0 : n)}
                  title={PK_SCALE_LABELS[n].label}
                  style={{
                    flex: 1, padding: '6px 0', borderRadius: 8, cursor: 'pointer', fontWeight: 700,
                    fontSize: 13, border: '2px solid',
                    borderColor: score === n ? PK_SCALE_LABELS[n].color : C.border,
                    background: score === n ? PK_SCALE_LABELS[n].color : C.surface,
                    color: score === n ? '#fff' : C.muted,
                    transition: 'all 0.15s',
                  }}
                >
                  {n}
                </button>
              ))}
            </div>

            {/* Campo de notas (aparece quando score está selecionado) */}
            {score > 0 && (
              <input
                type="text"
                placeholder="Observação complementar (opcional)"
                value={notes}
                onChange={e => setNotes(dim.notesKey, e.target.value)}
                style={{
                  width: '100%', padding: '7px 10px', borderRadius: 8, fontSize: 12,
                  border: `1.5px solid ${C.border}`, outline: 'none', color: C.dark,
                  boxSizing: 'border-box', fontFamily: 'inherit',
                }}
              />
            )}
          </div>
        );
      })}

      {/* Observações pedagógicas gerais */}
      <div style={{ marginTop: 4 }}>
        <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, display: 'block', marginBottom: 6 }}>
          Observações pedagógicas iniciais do professor
          <span style={{ fontWeight: 400 }}> (campo livre — opcional)</span>
        </label>
        <textarea
          value={pk.observacoes_pedagogicas}
          onChange={e => set('priorKnowledge', { ...pk, observacoes_pedagogicas: e.target.value })}
          rows={3}
          placeholder="Descreva outras características pedagógicas relevantes observadas. Quanto mais detalhes, mais precisos serão os documentos gerados pela IA."
          style={{
            width: '100%', padding: '10px 12px', borderRadius: 9, fontSize: 12,
            border: `1.5px solid ${C.border}`, outline: 'none', resize: 'vertical',
            color: C.dark, boxSizing: 'border-box', fontFamily: 'inherit', lineHeight: 1.5,
          }}
        />
      </div>
    </div>
  );
}

// ─── Step 2: Checklist ────────────────────────────────────────────────────────
function StepChecklist({ data, toggleCheck, set, checkedCount }: { data: WizardData; toggleCheck: (id: string) => void; set: any; checkedCount: number }) {
  return (
    <div>
      <div style={{
        background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10,
        padding: '10px 14px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <ClipboardList size={14} style={{ color: '#92400E', flexShrink: 0 }} />
        <span style={{ fontSize: 12, color: '#92400E', fontWeight: 600 }}>
          {checkedCount} comportamento(s) observado(s) — marque todos que se aplicam
        </span>
      </div>

      {CHECKLIST_CATEGORIES.map(cat => {
        const items = data.checklist.filter(i => i.category === cat);
        return (
          <div key={cat} style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: C.petrol, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
              {cat}
            </div>
            {items.map(item => (
              <label
                key={item.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                  borderRadius: 8, cursor: 'pointer', marginBottom: 4,
                  background: item.checked ? '#EFF9FF' : 'transparent',
                  border: `1.5px solid ${item.checked ? '#BAE6FD' : C.border}`,
                  transition: 'background 0.15s, border 0.15s',
                }}
              >
                <input
                  type="checkbox"
                  checked={item.checked}
                  onChange={() => toggleCheck(item.id)}
                  style={{ accentColor: C.petrol, width: 15, height: 15, flexShrink: 0 }}
                />
                <span style={{ fontSize: 12, color: item.checked ? C.petrol : C.dark, fontWeight: item.checked ? 600 : 400 }}>
                  {item.label}
                </span>
              </label>
            ))}
          </div>
        );
      })}

      <div style={{ marginTop: 16 }}>
        <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, display: 'block', marginBottom: 6 }}>
          Observações livres do professor regente
        </label>
        <textarea
          value={data.checklistObs}
          onChange={e => set('checklistObs', e.target.value)}
          rows={4}
          placeholder="Descreva outros comportamentos ou contextos relevantes observados em sala..."
          style={{
            width: '100%', padding: '10px 12px', borderRadius: 9, fontSize: 13,
            border: `1.5px solid ${C.border}`, outline: 'none', resize: 'vertical',
            color: C.dark, boxSizing: 'border-box', fontFamily: 'inherit',
          }}
        />
      </div>
    </div>
  );
}

// ─── Step 3: Análise ─────────────────────────────────────────────────────────
function StepAnalise({ data, set, checkedCount }: { data: WizardData; set: any; checkedCount: number }) {
  const summary = data.checklist
    .filter(i => i.checked)
    .reduce((acc, i) => {
      if (!acc[i.category]) acc[i.category] = [];
      acc[i.category].push(i.label);
      return acc;
    }, {} as Record<string, string[]>);

  return (
    <div>
      {/* Resumo do checklist */}
      {checkedCount > 0 && (
        <div style={{ background: C.bg, borderRadius: 12, padding: '14px 16px', marginBottom: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: C.petrol, textTransform: 'uppercase', marginBottom: 10 }}>
            Resumo — {checkedCount} comportamento(s) assinalado(s)
          </div>
          {Object.entries(summary).map(([cat, items]) => (
            <div key={cat} style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.dark, marginBottom: 3 }}>{cat}</div>
              <ul style={{ margin: 0, paddingLeft: 16 }}>
                {items.map((item, i) => (
                  <li key={i} style={{ fontSize: 11, color: C.muted, marginBottom: 2 }}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {checkedCount === 0 && (
        <div style={{
          background: '#FFF7ED', border: '1px solid #FDBA74', borderRadius: 10,
          padding: '10px 14px', marginBottom: 16, display: 'flex', gap: 8,
        }}>
          <AlertCircle size={14} style={{ color: '#9A3412', flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 12, color: '#9A3412' }}>
            Nenhum item do checklist foi marcado. Você pode prosseguir com análise manual.
          </span>
        </div>
      )}

      <div>
        <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, display: 'block', marginBottom: 6 }}>
          Parecer Pedagógico Inicial <span style={{ fontWeight: 400 }}>(análise manual)</span>
        </label>
        <textarea
          value={data.analiseManual}
          onChange={e => set('analiseManual', e.target.value)}
          rows={6}
          placeholder="Descreva a análise pedagógica inicial com base nas observações do checklist e outros dados coletados. Este texto fará parte do prontuário do aluno."
          style={{
            width: '100%', padding: '10px 12px', borderRadius: 9, fontSize: 13,
            border: `1.5px solid ${C.border}`, outline: 'none', resize: 'vertical',
            color: C.dark, boxSizing: 'border-box', fontFamily: 'inherit', lineHeight: 1.5,
          }}
        />
        <p style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>
          Este campo é opcional. Pode ser preenchido ou complementado mais tarde na ficha do aluno.
        </p>
      </div>
    </div>
  );
}

// ─── Step 4: Finalizar ────────────────────────────────────────────────────────
function StepFinalizar({ data, set, saving, savedStudent, generatingDocs, docsReady, onDownload, onFinish, error, pkIsIncomplete, pkFilledCount, onGoToProfile }: {
  data: WizardData; set: any; saving: boolean; savedStudent: Student | null;
  generatingDocs: boolean; docsReady: { nome: string; blob: Blob }[];
  onDownload: (d: { nome: string; blob: Blob }) => void;
  onFinish: () => void; error: string | null;
  pkIsIncomplete: boolean; pkFilledCount: number; onGoToProfile: () => void;
}) {
  const DOC_OPTIONS = [
    { key: 'termo' as const, label: 'Termo de Compromisso AEE', desc: 'Assinatura do responsável confirmando a matrícula no AEE' },
    { key: 'declaracao' as const, label: 'Declaração de Matrícula — SRM', desc: 'Declaração oficial de matrícula na Sala de Recursos Multifuncionais' },
    { key: 'compromisso' as const, label: 'Declaração de Compromisso', desc: 'Compromisso da família com o acompanhamento pedagógico' },
  ];

  return (
    <div>
      {/* Banner de aviso — perfil pedagógico incompleto */}
      {pkIsIncomplete && !savedStudent && (
        <div style={{
          background: '#FFFBEB', border: '1.5px solid #FDE68A', borderRadius: 12,
          padding: '12px 16px', marginBottom: 16, display: 'flex', gap: 12, alignItems: 'flex-start',
        }}>
          <Sparkles size={16} style={{ color: C.amber, flexShrink: 0, marginTop: 1 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#92400E', marginBottom: 3 }}>
              Perfil Pedagógico Inicial não preenchido
            </div>
            <div style={{ fontSize: 11, color: '#92400E', lineHeight: 1.5 }}>
              Sem esse perfil, a IA não consegue calibrar o nível de linguagem, complexidade de atividades e metas do PEI para o aluno real.
              Documentos gerados terão qualidade reduzida.
            </div>
            <button
              onClick={onGoToProfile}
              style={{
                marginTop: 8, padding: '5px 12px', borderRadius: 7, border: `1.5px solid ${C.amber}`,
                background: 'transparent', color: '#92400E', fontSize: 11, fontWeight: 700, cursor: 'pointer',
              }}
            >
              Voltar e preencher agora
            </button>
          </div>
        </div>
      )}

      {/* Resumo do aluno */}
      <div style={{ background: C.bg, borderRadius: 12, padding: '14px 18px', marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: C.petrol, textTransform: 'uppercase', marginBottom: 10 }}>
          Resumo da Matrícula
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 20px', fontSize: 12 }}>
          {[
            ['Aluno', data.name || '—'],
            ['Nascimento', data.birthDate || '—'],
            ['Série', data.grade || '—'],
            ['Turno', data.shift || '—'],
            ['Responsável', data.guardianName || '—'],
            ['Tipo', data.tipo_aluno === 'em_triagem' ? 'Em Triagem' : 'Com Laudo'],
          ].map(([l, v]) => (
            <div key={l}>
              <span style={{ color: C.muted, fontWeight: 600 }}>{l}: </span>
              <span style={{ color: C.dark }}>{v}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Documentos automáticos */}
      {!savedStudent && (
        <>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.dark, marginBottom: 10 }}>
            Documentos automáticos
          </div>
          <p style={{ fontSize: 12, color: C.muted, marginBottom: 14 }}>
            Ao finalizar, os documentos marcados serão gerados automaticamente, prontos para impressão e assinatura.
            Não possuem código de auditoria (documentos institucionais simples).
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
            {DOC_OPTIONS.map(opt => (
              <label key={opt.key} style={{
                display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px',
                borderRadius: 10, cursor: 'pointer',
                background: data.docs[opt.key] ? '#EFF9FF' : C.surface,
                border: `1.5px solid ${data.docs[opt.key] ? '#BAE6FD' : C.border}`,
              }}>
                <input
                  type="checkbox"
                  checked={data.docs[opt.key]}
                  onChange={e => set('docs', { ...data.docs, [opt.key]: e.target.checked })}
                  style={{ accentColor: C.petrol, marginTop: 2, flexShrink: 0 }}
                />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.dark }}>{opt.label}</div>
                  <div style={{ fontSize: 11, color: C.muted }}>{opt.desc}</div>
                </div>
              </label>
            ))}
          </div>

          {error && (
            <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 9, padding: '10px 14px', marginBottom: 14, color: C.red, fontSize: 12 }}>
              <AlertCircle size={13} style={{ marginRight: 6, verticalAlign: 'middle' }} />
              {error}
            </div>
          )}

          <button
            onClick={onFinish}
            disabled={saving}
            style={{
              width: '100%', padding: '12px', borderRadius: 10, border: 'none',
              background: saving ? C.border : `linear-gradient(135deg, ${C.amber}, #D97706)`,
              color: '#fff', fontWeight: 800, fontSize: 14, cursor: saving ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            {saving ? <><Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Salvando e gerando documentos…</> : 'Finalizar Matrícula e Gerar Documentos'}
          </button>
        </>
      )}

      {/* Estado após salvar */}
      {savedStudent && (
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#F0FDF4', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
            <CheckCircle2 size={28} color={C.green} />
          </div>
          <h3 style={{ fontSize: 16, fontWeight: 800, color: C.dark, marginBottom: 4 }}>Matrícula realizada!</h3>
          <p style={{ fontSize: 13, color: C.muted, marginBottom: 20 }}>
            {savedStudent.name} foi cadastrado(a) com sucesso.
          </p>

          {generatingDocs && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: C.muted, fontSize: 13 }}>
              <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} />
              Gerando documentos…
            </div>
          )}

          {docsReady.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.dark, textAlign: 'left', marginBottom: 4 }}>
                Documentos prontos para download:
              </div>
              {docsReady.map((doc, i) => (
                <button
                  key={i}
                  onClick={() => onDownload(doc)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px',
                    borderRadius: 10, border: `1.5px solid ${C.petrol}`,
                    background: C.surface, cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <Download size={15} style={{ color: C.petrol, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: C.petrol, flex: 1 }}>{doc.nome}</span>
                  <ChevronRight size={13} style={{ color: C.muted }} />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
