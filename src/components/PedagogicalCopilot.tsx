import React, { useState, useEffect, useCallback } from 'react';
import {
  Sparkles,
  X,
  ChevronRight,
  BookOpen,
  FileText,
  Image,
  Printer,
  Tag,
  Brain,
  Calendar,
  Users,
  Zap,
  ArrowRight,
  Lightbulb,
  CheckCircle2,
  ScanText,
} from 'lucide-react';
import { User, Student, Protocol, Appointment } from '../types';

// ─── Paleta ───────────────────────────────────────────────────────────────────
const C = {
  petrol:    '#1F4E5F',
  dark:      '#2E3A59',
  gold:      '#C69214',
  goldLight: '#FDF6E3',
  surface:   '#FFFFFF',
  bg:        '#F6F4EF',
  border:    '#E7E2D8',
  textSec:   '#667085',
};

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface CopilotSuggestion {
  id: string;
  icon: React.ElementType;
  label: string;
  description: string;
  action?: () => void;
  color?: string;
  badge?: string;
}

interface PedagogicalCopilotProps {
  currentView: string;
  user: User;
  students: Student[];
  protocols: Protocol[];
  appointments: Appointment[];
  viewingStudent?: Student | null;
  onNavigate: (view: string) => void;
  /** IDs dos nodes presentes no canvas AtivaIA (ex: ['upload','ocr','adaptar','bncc']) */
  workflowNodeIds?: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function buildSuggestions(
  view: string,
  student: Student | null | undefined,
  protocols: Protocol[],
  appointments: Appointment[],
  onNavigate: (v: string) => void,
  workflowNodeIds: string[] = []
): CopilotSuggestion[] {
  const today = todayISO();

  const todayApts = appointments.filter(
    a => a.date.slice(0, 10) === today && a.status === 'agendado'
  );

  // ── Contexto: AtivaIA / workflows ────────────────────────────────────────
  if (['ativaIA', 'incluiLab', 'eduLensIA', 'neuroDesign'].includes(view)) {
    // Sugestões dinâmicas baseadas nos nodes presentes no canvas
    const hasUpload    = workflowNodeIds.includes('upload');
    const hasOcr       = workflowNodeIds.includes('ocr');
    const hasAdaptar   = workflowNodeIds.includes('adaptar');
    const hasBncc      = workflowNodeIds.includes('bncc');
    const hasComposicao= workflowNodeIds.includes('composicao');
    const hasFolha     = workflowNodeIds.includes('folhapronta');
    const hasAnyNodes  = workflowNodeIds.length > 0;

    const dynamic: CopilotSuggestion[] = [];

    // Se tem upload mas não tem OCR → sugerir OCR
    if (hasUpload && !hasOcr) {
      dynamic.push({
        id: 'add-ocr',
        icon: ScanText,
        label: 'Extrair texto com OCR',
        description: 'Você tem um upload. Adicione o bloco OCR para extrair o texto automaticamente.',
        color: '#7C3AED',
        badge: 'Sugerido',
      });
    }

    // Se tem OCR mas não tem Adaptar → sugerir Adaptar
    if (hasOcr && !hasAdaptar) {
      dynamic.push({
        id: 'add-adaptar',
        icon: Brain,
        label: 'Adaptar para necessidades específicas',
        description: 'Texto extraído! Adicione o bloco "Adaptar Atividade" para adequar ao aluno.',
        color: '#D97706',
        badge: 'Próximo passo',
      });
    }

    // Se tem conteúdo mas não tem BNCC → sugerir BNCC
    if (hasAnyNodes && !hasBncc) {
      dynamic.push({
        id: 'add-bncc',
        icon: Tag,
        label: 'Identificar habilidade BNCC',
        description: 'Marque a competência da BNCC antes de exportar para garantir rastreabilidade pedagógica.',
        color: '#7C3AED',
        badge: 'Recomendado',
      });
    }

    // Se tem conteúdo mas não tem imagens → sugerir composição visual
    if (hasAnyNodes && !hasComposicao) {
      dynamic.push({
        id: 'add-imagem',
        icon: Image,
        label: 'Gerar imagens pedagógicas',
        description: 'Adicione o bloco "Composição Visual" para gerar ilustrações inclusivas para a atividade.',
        color: C.petrol,
      });
    }

    // Se tem imagens mas não tem FolhaPronta → sugerir PDF
    if ((hasComposicao || hasAdaptar) && !hasFolha) {
      dynamic.push({
        id: 'add-pdf',
        icon: Printer,
        label: 'Gerar folha pedagógica pronta',
        description: 'Adicione o bloco "FolhaPronta" para montar e exportar o documento final para impressão.',
        color: '#059669',
        badge: 'Próximo passo',
      });
    }

    // Se tem FolhaPronta → sugerir exportar
    if (hasFolha) {
      dynamic.push({
        id: 'export-pdf',
        icon: Printer,
        label: 'Exportar PDF da atividade',
        description: 'Seu fluxo está completo. Execute e depois clique em "Exportar PDF" no bloco FolhaPronta.',
        color: '#DC2626',
        badge: 'Pronto!',
      });
    }

    // Se não há nodes ainda → sugestões de início
    if (!hasAnyNodes) {
      dynamic.push(
        {
          id: 'start-tea',
          icon: Brain,
          label: 'Começar com template TEA',
          description: 'Use o template pronto para criar atividade adaptada para Transtorno do Espectro Autista.',
          color: '#D97706',
          badge: 'Template',
        },
        {
          id: 'start-ilustrada',
          icon: Image,
          label: 'Atividade com imagens ilustrativas',
          description: 'Template para gerar atividade com imagens pedagógicas inclusivas.',
          color: C.petrol,
          badge: 'Template',
        }
      );
    }

    // Sempre sugerir vincular a aluno se houver alunos
    dynamic.push({
      id: 'link-student',
      icon: Users,
      label: 'Salvar vinculada a um aluno',
      description: 'Após executar, salve a atividade vinculada a um aluno para aparecer na timeline dele.',
      color: C.dark,
    });

    return dynamic.slice(0, 5); // máximo de 5 sugestões
  }

  // ── Contexto: Perfil do aluno ─────────────────────────────────────────────
  if (view === 'student_profile' && student) {
    const hasEvolutions = (student.evolutions?.length ?? 0) > 0;
    const hasDocuments  = (student.documents?.length ?? 0) > 0;
    const hasProtocols  = protocols.filter(p => p.studentId === student.id).length > 0;

    return [
      ...(!hasProtocols ? [{
        id: 'create-pei',
        icon: FileText,
        label: 'Criar PEI para este aluno',
        description: `${student.name} ainda não tem PEI. Comece agora com suporte da IA.`,
        action: () => onNavigate('protocols'),
        color: C.petrol,
        badge: 'Pendente',
      }] : []),
      ...(!hasEvolutions ? [{
        id: 'add-evolution',
        icon: Brain,
        label: 'Registrar perfil cognitivo',
        description: 'Adicione a primeira avaliação das habilidades e dificuldades.',
        action: () => onNavigate('relatorios'),
        color: '#7C3AED',
        badge: 'Pendente',
      }] : []),
      {
        id: 'schedule',
        icon: Calendar,
        label: 'Agendar atendimento',
        description: `Marque o próximo atendimento para ${student.name} na agenda.`,
        action: () => onNavigate('agenda'),
        color: C.gold,
      },
      {
        id: 'activity',
        icon: Zap,
        label: 'Gerar atividade adaptada',
        description: 'Use o AtivaIA para criar atividade personalizada para este aluno.',
        action: () => onNavigate('ativaIA'),
        color: '#D97706',
      },
      ...(!hasDocuments ? [{
        id: 'upload-laudo',
        icon: BookOpen,
        label: 'Enviar laudo médico',
        description: 'Faça upload do laudo para análise automática pela IA.',
        color: '#059669',
        badge: 'Sugerido',
      }] : []),
    ];
  }

  // ── Contexto: Criação de documentos ──────────────────────────────────────
  if (['protocols', 'pdi', 'paee', 'estudo_caso', 'ficha'].includes(view)) {
    return [
      {
        id: 'ai-gen',
        icon: Sparkles,
        label: 'Gerar com IA',
        description: 'Use a IA para preencher as seções automaticamente com base no perfil do aluno.',
        color: '#7C3AED',
        badge: 'IA',
      },
      {
        id: 'bncc-link',
        icon: Tag,
        label: 'Vincular habilidades BNCC',
        description: 'Associe as metas pedagógicas às competências da BNCC.',
        color: C.petrol,
      },
      {
        id: 'finalize',
        icon: CheckCircle2,
        label: 'Finalizar documento',
        description: 'Ao finalizar, o documento ganha código de auditoria e pode ser impresso.',
        color: '#059669',
      },
      {
        id: 'derive',
        icon: ArrowRight,
        label: 'Criar documento derivado',
        description: 'Gere um PEI a partir do Estudo de Caso, ou um PDI a partir do PEI.',
        color: C.dark,
      },
    ];
  }

  // ── Contexto: Dashboard ───────────────────────────────────────────────────
  if (view === 'dashboard') {
    return [
      ...(todayApts.length > 0 ? [{
        id: 'today-apts',
        icon: Calendar,
        label: `${todayApts.length} atendimento(s) hoje`,
        description: todayApts.map(a => `${a.time} — ${a.title}`).join(' · '),
        action: () => onNavigate('agenda'),
        color: C.gold,
        badge: 'Hoje',
      }] : []),
      {
        id: 'add-student',
        icon: Users,
        label: 'Cadastrar novo aluno',
        description: 'Adicione um aluno em triagem ou com laudo ao sistema.',
        action: () => onNavigate('students'),
        color: C.petrol,
      },
      {
        id: 'workflow',
        icon: Zap,
        label: 'Criar atividade no AtivaIA',
        description: 'Monte um workflow visual para gerar atividade pedagógica com IA.',
        action: () => onNavigate('ativaIA'),
        color: '#D97706',
        badge: 'NOVO',
      },
      {
        id: 'ficha',
        icon: BookOpen,
        label: 'Preencher ficha de observação',
        description: 'Registre observações da semana sobre um aluno.',
        action: () => onNavigate('fichas_complementares'),
        color: '#7C3AED',
      },
    ];
  }

  // ── Fallback genérico ─────────────────────────────────────────────────────
  return [
    {
      id: 'gen1',
      icon: Zap,
      label: 'Ir para o AtivaIA',
      description: 'Crie atividades pedagógicas adaptadas com fluxo visual.',
      action: () => onNavigate('ativaIA'),
      color: C.petrol,
    },
    {
      id: 'gen2',
      icon: Calendar,
      label: 'Ver agenda de hoje',
      description: 'Confira seus atendimentos agendados.',
      action: () => onNavigate('agenda'),
      color: C.gold,
    },
    {
      id: 'gen3',
      icon: FileText,
      label: 'Criar documento pedagógico',
      description: 'PEI, PAEE, PDI ou Estudo de Caso.',
      action: () => onNavigate('estudo_caso'),
      color: C.dark,
    },
  ];
}

// ─── Componente principal ─────────────────────────────────────────────────────
export const PedagogicalCopilot: React.FC<PedagogicalCopilotProps> = ({
  currentView,
  user,
  students,
  protocols,
  appointments,
  viewingStudent,
  onNavigate,
  workflowNodeIds = [],
}) => {
  const [isOpen, setIsOpen]           = useState(false);
  const [acted, setActed]             = useState<Set<string>>(new Set());
  const [pulse, setPulse]             = useState(false);

  // Pulsa quando a view muda para avisar novas sugestões
  useEffect(() => {
    setPulse(true);
    setActed(new Set());
    const t = setTimeout(() => setPulse(false), 2000);
    return () => clearTimeout(t);
  }, [currentView]);

  const suggestions = buildSuggestions(
    currentView,
    viewingStudent,
    protocols,
    appointments,
    onNavigate,
    workflowNodeIds
  );

  const handleAction = useCallback((s: CopilotSuggestion) => {
    setActed(prev => new Set([...prev, s.id]));
    s.action?.();
  }, []);

  const contextLabel: Record<string, string> = {
    ativaIA:          'Workflow AtivaIA',
    eduLensIA:        'EduLensIA',
    neuroDesign:      'NeuroDesign',
    incluiLab:        'IncluiLAB',
    student_profile:  viewingStudent ? viewingStudent.name : 'Perfil do Aluno',
    protocols:        'Documento PEI',
    pdi:              'Documento PDI',
    paee:             'Documento PAEE',
    estudo_caso:      'Estudo de Caso',
    ficha:            'Ficha de Acompanhamento',
    dashboard:        'Início',
    agenda:           'Agenda',
    students:         'Meus Alunos',
    relatorios:       'Relatório Evolutivo',
  };

  const label = contextLabel[currentView] ?? 'Plataforma';

  return (
    <>
      {/* Botão flutuante ─────────────────────────────────────────────── */}
      <button
        onClick={() => setIsOpen(o => !o)}
        title="Copilot Pedagógico"
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-2xl font-bold text-sm text-white shadow-xl transition-all duration-200 hover:scale-105 active:scale-95 print:hidden"
        style={{
          background: `linear-gradient(135deg, ${C.petrol}, #0F3044)`,
          boxShadow: '0 8px 32px rgba(31,78,95,0.35)',
        }}
      >
        {/* Ponto de atenção pulsante */}
        {pulse && !isOpen && (
          <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-yellow-400 animate-ping" />
        )}
        <Sparkles size={16} className={pulse && !isOpen ? 'animate-bounce' : ''} />
        <span className="hidden sm:inline">Copilot</span>
      </button>

      {/* Painel lateral ────────────────────────────────────────────────── */}
      {isOpen && (
        <div
          className="fixed bottom-20 right-6 z-50 w-80 rounded-2xl shadow-2xl overflow-hidden print:hidden"
          style={{
            background: C.surface,
            border: `1.5px solid ${C.border}`,
            boxShadow: '0 20px 60px rgba(31,78,95,0.20)',
          }}
        >
          {/* Header */}
          <div
            className="px-5 py-4 flex items-center justify-between"
            style={{
              background: `linear-gradient(135deg, ${C.petrol}, #0F3044)`,
            }}
          >
            <div>
              <div className="flex items-center gap-2">
                <Sparkles size={14} className="text-yellow-300" />
                <span className="text-sm font-bold text-white">Copilot Pedagógico</span>
              </div>
              <div className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.6)' }}>
                Contexto: <span className="font-semibold text-yellow-300">{label}</span>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition"
            >
              <X size={16} />
            </button>
          </div>

          {/* Tip */}
          <div
            className="px-4 py-2.5 flex items-start gap-2 border-b"
            style={{ background: C.goldLight, borderColor: '#F0E2B0' }}
          >
            <Lightbulb size={13} className="mt-0.5 shrink-0" style={{ color: C.gold }} />
            <p className="text-[10px] leading-relaxed" style={{ color: '#92400E' }}>
              Sugestões inteligentes baseadas no que você está fazendo agora.
            </p>
          </div>

          {/* Sugestões */}
          <div className="p-3 space-y-2 max-h-96 overflow-y-auto">
            {suggestions.map(s => {
              const Icon = s.icon;
              const done = acted.has(s.id);
              return (
                <button
                  key={s.id}
                  onClick={() => handleAction(s)}
                  className="w-full flex items-start gap-3 p-3 rounded-xl text-left transition-all hover:scale-[1.01] active:scale-[0.99]"
                  style={{
                    background: done ? '#F0FDF4' : C.bg,
                    border: `1px solid ${done ? '#BBF7D0' : C.border}`,
                    opacity: done ? 0.75 : 1,
                  }}
                >
                  {/* Ícone */}
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                    style={{ background: (s.color ?? C.petrol) + '18' }}
                  >
                    {done
                      ? <CheckCircle2 size={15} style={{ color: '#166534' }} />
                      : <Icon size={15} style={{ color: s.color ?? C.petrol }} />
                    }
                  </div>

                  {/* Texto */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-xs font-bold truncate" style={{ color: C.dark }}>
                        {s.label}
                      </span>
                      {s.badge && !done && (
                        <span
                          className="text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0"
                          style={{
                            background: s.badge === 'Hoje' ? '#FEF9C3' : s.badge === 'IA' ? '#EDE9FE' : C.goldLight,
                            color: s.badge === 'Hoje' ? '#92400E' : s.badge === 'IA' ? '#6D28D9' : C.gold,
                          }}
                        >
                          {s.badge}
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] leading-relaxed" style={{ color: C.textSec }}>
                      {s.description}
                    </p>
                  </div>

                  {/* Seta */}
                  {s.action && !done && (
                    <ChevronRight size={14} className="shrink-0 mt-2" style={{ color: C.textSec }} />
                  )}
                </button>
              );
            })}
          </div>

          {/* Footer */}
          <div
            className="px-4 py-3 border-t flex items-center justify-between"
            style={{ borderColor: C.border, background: C.bg }}
          >
            <span className="text-[9px] font-medium" style={{ color: C.textSec }}>
              IncluiAI · Copilot v1
            </span>
            <div className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              <span className="text-[9px]" style={{ color: C.textSec }}>Ativo</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
};