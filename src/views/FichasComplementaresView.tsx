// views/FichasComplementaresView.tsx
// Fichas de Observação (processo) + Documentos para Responsáveis (pais)
// v2 — PDF real, checklist dinâmico, áudio, versionamento, UI cards
import React, { useState, useRef, useEffect } from 'react';
import { Student, User } from '../types';
import {
  ClipboardCheck, FileText, Save, ShieldCheck, History,
  FilePlus, Download, Upload, PenLine, HandMetal,
  ChevronDown, ChevronUp,
} from 'lucide-react';
import { AudioEnhancedTextarea } from '../components/AudioEnhancedTextarea';
import { DynamicChecklist, DynChecklistSection } from '../components/DynamicChecklist';
import { SignaturePad } from '../components/SignaturePad';
import { DocumentCard } from '../components/DocumentCard';
import { DocumentHistory, DocVersion } from '../components/DocumentHistory';
import { PDFGenerator, getDocTitle } from '../services/PDFGenerator';
import { ObservationFormService, TimelineService } from '../services/persistenceService';
import { DEMO_MODE } from '../services/supabase';

interface Props {
  students: Student[];
  user: User;
}

// ─── Fichas de Observação ─────────────────────────────────────────────────────
interface FichaField {
  id: string;
  label: string;
  type: 'textarea' | 'text' | 'select' | 'date' | 'scale';
  placeholder?: string;
  options?: string[];
}

interface FichaTemplate {
  id: string;
  title: string;
  description: string;
  color: string;
  icon: string;
  fields: FichaField[];
}

const FICHAS: FichaTemplate[] = [
  {
    id: 'obs_regente',
    title: 'Observação do Professor Regente',
    description: 'Registro das observações do professor da sala comum sobre o aluno.',
    color: 'blue', icon: '👩‍🏫',
    fields: [
      { id: 'data_obs', label: 'Data da Observação', type: 'date' },
      { id: 'comportamento', label: 'Comportamento em Sala', type: 'textarea', placeholder: 'Descreva o comportamento, interações e participação do aluno...' },
      { id: 'aprendizagem', label: 'Evolução na Aprendizagem', type: 'textarea', placeholder: 'Como o aluno está respondendo às atividades e estratégias?' },
      { id: 'estrategias', label: 'Estratégias Utilizadas', type: 'textarea', placeholder: 'Quais recursos e adaptações foram aplicados?' },
      { id: 'encaminhamentos', label: 'Encaminhamentos Necessários', type: 'textarea', placeholder: 'Há necessidade de acionar outros profissionais ou família?' },
      { id: 'nivel', label: 'Nível Geral de Desempenho', type: 'scale' },
    ],
  },
  {
    id: 'escuta_familia',
    title: 'Escuta da Família',
    description: 'Registro da conversa com o responsável sobre o desenvolvimento do aluno.',
    color: 'green', icon: '👨‍👩‍👧',
    fields: [
      { id: 'data_reuniao', label: 'Data da Reunião/Contato', type: 'date' },
      { id: 'responsavel', label: 'Nome do Responsável Presente', type: 'text', placeholder: 'Nome e grau de parentesco' },
      { id: 'relato_familia', label: 'Relato da Família', type: 'textarea', placeholder: 'O que a família observa em casa? Rotinas, comportamentos, aprendizagem...' },
      { id: 'preocupacoes', label: 'Preocupações Sinalizadas', type: 'textarea', placeholder: 'Quais as principais preocupações relatadas pela família?' },
      { id: 'acordo', label: 'Acordos e Comprometimentos', type: 'textarea', placeholder: 'O que foi combinado com a família para apoiar o aluno?' },
      { id: 'proxima_data', label: 'Próximo Contato Previsto', type: 'date' },
    ],
  },
  {
    id: 'analise_aee',
    title: 'Análise do AEE',
    description: 'Parecer do professor de AEE sobre o atendimento especializado.',
    color: 'purple', icon: '🎯',
    fields: [
      { id: 'data_aee', label: 'Data do Atendimento', type: 'date' },
      { id: 'periodo', label: 'Período de Referência', type: 'text', placeholder: 'Ex: Março/2025 – Junho/2025' },
      { id: 'descricao_at', label: 'Descrição das Atividades', type: 'textarea', placeholder: 'Que atividades foram desenvolvidas no AEE?' },
      { id: 'evolucao_obs', label: 'Evolução Observada', type: 'textarea', placeholder: 'Como o aluno evoluiu nos critérios de acompanhamento?' },
      { id: 'recursos', label: 'Recursos e TA Utilizados', type: 'textarea', placeholder: 'Tecnologias Assistivas e materiais adaptados...' },
      { id: 'comunicacao', label: 'Articulação com Sala Comum', type: 'textarea', placeholder: 'Como está a articulação com o professor regente?' },
      { id: 'nivel_aee', label: 'Evolução Geral (Escala)', type: 'scale' },
    ],
  },
  {
    id: 'decisao_institucional',
    title: 'Decisão Institucional',
    description: 'Registro formal da decisão da equipe sobre os próximos passos do aluno.',
    color: 'red', icon: '⚖️',
    fields: [
      { id: 'data_decisao', label: 'Data da Reunião Institucional', type: 'date' },
      { id: 'presentes', label: 'Pessoas Envolvidas', type: 'select', options: ['Professor Regente', 'AEE', 'Coordenação', 'Família', 'Gestão', 'Psicólogo', 'Fonoaudiólogo', 'Outro'] },
      { id: 'diagnostico_equipe', label: 'Síntese Diagnóstica da Equipe', type: 'textarea', placeholder: 'Qual a conclusão da equipe sobre o aluno?' },
      { id: 'decisao', label: 'Decisão Tomada', type: 'select', options: ['Encaminhar para PEI', 'Encaminhar para PAEE', 'Manter em acompanhamento', 'Encaminhar para avaliação externa', 'Encaminhar para Secretaria de Educação', 'Outra decisão'] },
      { id: 'justificativa', label: 'Justificativa da Decisão', type: 'textarea', placeholder: 'Por que esta foi a decisão tomada?' },
      { id: 'proximos_passos', label: 'Próximos Passos', type: 'textarea', placeholder: 'Quais ações serão tomadas a partir desta decisão?' },
    ],
  },
  {
    id: 'acompanhamento_evolucao',
    title: 'Acompanhamento / Evolução',
    description: 'Ficha de acompanhamento periódico do desenvolvimento do aluno.',
    color: 'orange', icon: '📈',
    fields: [
      { id: 'data_acomp', label: 'Data do Registro', type: 'date' },
      { id: 'periodo_ref', label: 'Período de Referência', type: 'text', placeholder: 'Bimestre, semestre, etc.' },
      { id: 'metas_atingidas', label: 'Metas Atingidas', type: 'textarea', placeholder: 'Quais metas do PEI/PAEE foram alcançadas?' },
      { id: 'metas_andamento', label: 'Metas em Andamento', type: 'textarea', placeholder: 'Quais estão em desenvolvimento?' },
      { id: 'ajustes', label: 'Ajustes Necessários', type: 'textarea', placeholder: 'O que precisa ser revisado ou adaptado?' },
      { id: 'comunicado_familia', label: 'Comunicação com a Família', type: 'textarea', placeholder: 'O que foi comunicado à família?' },
      { id: 'nivel_geral', label: 'Nível Geral de Evolução', type: 'scale' },
    ],
  },
];

const COLOR_MAP: Record<string, { bg: string; border: string; text: string; accent: string }> = {
  blue:   { bg: 'bg-blue-50',   border: 'border-blue-200',   text: 'text-blue-800',   accent: '#1d4ed8' },
  green:  { bg: 'bg-green-50',  border: 'border-green-200',  text: 'text-green-800',  accent: '#15803d' },
  purple: { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-800', accent: '#7c3aed' },
  red:    { bg: 'bg-red-50',    border: 'border-red-200',    text: 'text-red-800',    accent: '#dc2626' },
  orange: { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-800', accent: '#ea580c' },
};

// ─── Documentos para Responsáveis ─────────────────────────────────────────────
type ParentDocStatus =
  | 'draft' | 'generated' | 'printed' | 'downloaded'
  | 'signed_digitally' | 'uploaded_signed_copy';

interface ParentDocState {
  docType: string;
  status: ParentDocStatus;
  filledData: Record<string, string>;
  // checklist dinâmico (substituiu checklistData: Record<string,boolean>)
  checklistSections: DynChecklistSection[];
  uploadedFileName?: string;
  uploadedFileUrl?: string;
  auditCode?: string;
  generatedAt?: string;
  showHistory?: boolean;
  versions: DocVersion[];
  // Assinatura do responsável
  parentSignatureData?: string;   // base64 PNG da assinatura digital
  parentSignatureMode?: 'digital' | 'manual' | null; // como será assinado
  parentSignerName?: string;      // nome de quem assinou
}

// ─── Checklist padrão (4 laudas) ─────────────────────────────────────────────
// Items without `checked` — buildDefaultChecklistSections() adds it
const DEFAULT_CHECKLIST_SECTIONS: Array<{
  id: string; title: string;
  items: Array<{ id: string; text: string; isCustom: boolean }>;
}> = [
  {
    id: 'cognitivo',
    title: 'Lauda 1 — Desenvolvimento Cognitivo e Aprendizagem',
    items: [
      { id: 'cog_01', text: 'Dificuldade em seguir instruções sequenciais', isCustom: false },
      { id: 'cog_02', text: 'Dificuldade em manter atenção por períodos prolongados', isCustom: false },
      { id: 'cog_03', text: 'Dificuldade na leitura e decodificação de palavras', isCustom: false },
      { id: 'cog_04', text: 'Dificuldade na escrita (traçado, organização)', isCustom: false },
      { id: 'cog_05', text: 'Dificuldade em operações matemáticas básicas', isCustom: false },
      { id: 'cog_06', text: 'Dificuldade em compreensão de textos', isCustom: false },
      { id: 'cog_07', text: 'Lentidão no processamento de informações', isCustom: false },
      { id: 'cog_08', text: 'Dificuldade de memória de trabalho', isCustom: false },
      { id: 'cog_09', text: 'Precisa de repetição frequente de instruções', isCustom: false },
      { id: 'cog_10', text: 'Dificuldade em generalizar aprendizados para novos contextos', isCustom: false },
    ],
  },
  {
    id: 'comunicacao',
    title: 'Lauda 2 — Comunicação e Linguagem',
    items: [
      { id: 'com_01', text: 'Dificuldade na comunicação oral', isCustom: false },
      { id: 'com_02', text: 'Vocabulário limitado para a faixa etária', isCustom: false },
      { id: 'com_03', text: 'Dificuldade de compreensão de enunciados e comandos', isCustom: false },
      { id: 'com_04', text: 'Usa comunicação alternativa (gestos, símbolos, CAA)', isCustom: false },
      { id: 'com_05', text: 'Gagueira, disfluência ou alterações na fala', isCustom: false },
      { id: 'com_06', text: 'Dificuldade em narrar sequências de eventos', isCustom: false },
      { id: 'com_07', text: 'Não responde de forma consistente quando chamado pelo nome', isCustom: false },
      { id: 'com_08', text: 'Dificuldade em iniciar ou manter diálogos', isCustom: false },
      { id: 'com_09', text: 'Discurso desorganizado ou incoerente para a idade', isCustom: false },
      { id: 'com_10', text: 'Ecolalia (repetição de falas de outros)', isCustom: false },
    ],
  },
  {
    id: 'comportamento',
    title: 'Lauda 3 — Comportamento e Habilidades Socioemocionais',
    items: [
      { id: 'comp_01', text: 'Comportamentos autolesivos observados', isCustom: false },
      { id: 'comp_02', text: 'Agressividade com pares ou adultos', isCustom: false },
      { id: 'comp_03', text: 'Dificuldade significativa em interações sociais', isCustom: false },
      { id: 'comp_04', text: 'Isolamento social frequente', isCustom: false },
      { id: 'comp_05', text: 'Crises emocionais frequentes (choro, fúria, pânico)', isCustom: false },
      { id: 'comp_06', text: 'Ansiedade observável em situações escolares', isCustom: false },
      { id: 'comp_07', text: 'Comportamentos repetitivos e estereotipados', isCustom: false },
      { id: 'comp_08', text: 'Hipersensibilidade sensorial (sons, texturas, luzes)', isCustom: false },
      { id: 'comp_09', text: 'Dificuldade em aceitar mudanças de rotina', isCustom: false },
      { id: 'comp_10', text: 'Dificuldade em seguir regras e combinados do ambiente', isCustom: false },
    ],
  },
  {
    id: 'motor',
    title: 'Lauda 4 — Desenvolvimento Motor, Sensorial e Saúde',
    items: [
      { id: 'mot_01', text: 'Dificuldade de coordenação motora fina (recorte, escrita)', isCustom: false },
      { id: 'mot_02', text: 'Dificuldade de coordenação motora grossa (pular, correr)', isCustom: false },
      { id: 'mot_03', text: 'Dificuldade em atividades de vida diária (higiene, alimentação)', isCustom: false },
      { id: 'mot_04', text: 'Hipotonia ou hipertonia muscular observável', isCustom: false },
      { id: 'mot_05', text: 'Hiposensibilidade (busca intensa de estímulos sensoriais)', isCustom: false },
      { id: 'mot_06', text: 'Dificuldade de integração sensorial', isCustom: false },
      { id: 'mot_07', text: 'Uso de órteses, dispositivos de auxílio ou cadeira de rodas', isCustom: false },
      { id: 'mot_08', text: 'Faz uso de medicação contínua', isCustom: false },
      { id: 'mot_09', text: 'Tem laudo médico / diagnóstico formal', isCustom: false },
      { id: 'mot_10', text: 'Está em acompanhamento terapêutico externo (psicólogo, fono, neuro)', isCustom: false },
    ],
  },
];

function buildDefaultChecklistSections(): DynChecklistSection[] {
  return DEFAULT_CHECKLIST_SECTIONS.map(sec => ({
    id: sec.id,
    title: sec.title,
    items: sec.items.map(item => ({ ...item, checked: false })),
  }));
}

// ─── Documentos disponíveis ───────────────────────────────────────────────────
interface ParentDocTemplate {
  id: string;
  title: string;
  description: string;
  icon: string;
  category: string;
  hasForm?: boolean;
}

const PARENT_DOCS: ParentDocTemplate[] = [
  { id: 'checklist_4laudas',        title: 'Checklist de Observação Estruturado', description: '4 laudas de itens observacionais por área de desenvolvimento.', icon: '📋', category: 'Triagem', hasForm: true },
  { id: 'encaminhamento_redes',     title: 'Encaminhamento às Redes de Apoio',    description: 'Encaminhamento formal para Saúde, Assistência Social e outros setores.', icon: '📨', category: 'Encaminhamentos', hasForm: true },
  { id: 'convite_reuniao',          title: 'Convite para Reunião',                description: 'Convite formal para reunião pedagógica com os responsáveis.', icon: '📩', category: 'Comunicação', hasForm: true },
  { id: 'termo_compromisso_aee',    title: 'Termo de Compromisso no AEE',         description: 'Termo de ciência e comprometimento dos responsáveis com o AEE.', icon: '📃', category: 'Termos', hasForm: false },
  { id: 'declaracao_comparecimento',title: 'Declaração de Comparecimento',        description: 'Declaração de presença do responsável em reunião ou atendimento.', icon: '📝', category: 'Declarações', hasForm: true },
  { id: 'termo_desligamento',       title: 'Termo de Desligamento',               description: 'Documento de encerramento do acompanhamento especializado.', icon: '📄', category: 'Termos', hasForm: true },
  { id: 'declaracao_matricula',     title: 'Declaração de Matrícula na Sala de Recursos', description: 'Declaração oficial de matrícula no AEE / Sala de Recursos.', icon: '🏫', category: 'Declarações', hasForm: false },
];

// ─── Opções de campos especiais ───────────────────────────────────────────────
const SETOR_OPTIONS = [
  'Saúde', 'Assistência Social', 'Conselho Tutelar', 'CAPS', 'CRAS', 'CREAS',
  'UBS', 'Neuropediatria', 'Psicologia', 'Fonoaudiologia',
  'Terapia Ocupacional', 'Psicopedagogia', 'Outros',
];

const MOTIVO_ENCAMINHAMENTO_OPTIONS = [
  'dificuldades de aprendizagem',
  'dificuldades comportamentais',
  'suspeita de transtorno do neurodesenvolvimento',
  'necessidade de avaliação multiprofissional',
  'dificuldades de comunicação',
  'dificuldades motoras',
  'questões emocionais',
  'faltas recorrentes',
  'vulnerabilidade social',
  'necessidade de acompanhamento familiar',
];

const MOTIVO_DESLIGAMENTO_OPTIONS = [
  'transferência',
  'alta pedagógica',
  'encerramento do acompanhamento',
  'solicitação da família',
  'frequência insuficiente',
  'reorganização da demanda',
  'outro',
];

// ─── Status ───────────────────────────────────────────────────────────────────
const STATUS_LABELS: Record<ParentDocStatus, string> = {
  draft:               'Não gerado',
  generated:           'Gerado',
  printed:             'Impresso',
  downloaded:          'Baixado',
  signed_digitally:    'Assinado digitalmente',
  uploaded_signed_copy:'Cópia assinada enviada',
};
const STATUS_COLORS: Record<ParentDocStatus, string> = {
  draft:               'bg-gray-100 text-gray-500',
  generated:           'bg-blue-100 text-blue-700',
  printed:             'bg-purple-100 text-purple-700',
  downloaded:          'bg-indigo-100 text-indigo-700',
  signed_digitally:    'bg-green-100 text-green-700',
  uploaded_signed_copy:'bg-teal-100 text-teal-700',
};

// ─── Audit code ───────────────────────────────────────────────────────────────
function makeAuditCode(seed: string): string {
  let h = 0;
  const s = seed + Date.now().toString();
  for (let i = 0; i < s.length; i++) { h = (h << 5) - h + s.charCodeAt(i); h |= 0; }
  return `DOC-${Math.abs(h).toString(16).toUpperCase().slice(0, 8)}`;
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────
export const FichasComplementaresView: React.FC<Props> = ({ students, user }) => {
  const [activeTab, setActiveTab] = useState<'fichas' | 'documentos'>('fichas');
  const [selectedStudentId, setSelectedStudentId] = useState('');

  // Tab 1: Fichas de Observação
  const [expandedFicha, setExpandedFicha] = useState<string | null>(null);
  const [fichaValues, setFichaValues] = useState<Record<string, Record<string, string>>>({});
  const [savedFichas, setSavedFichas] = useState<Record<string, { code: string; savedAt: string }>>({});
  const [generatingFicha, setGeneratingFicha] = useState<string | null>(null);

  // Tab 2: Documentos para Responsáveis
  const [parentDocs, setParentDocs] = useState<Record<string, ParentDocState>>({});
  const [expandedDoc, setExpandedDoc] = useState<string | null>(null);
  const [generating, setGenerating] = useState<string | null>(null);

  const uploadInputRef = useRef<HTMLInputElement>(null);
  const pendingUploadDocType = useRef<string | null>(null);

  // SignaturePad do responsável
  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const [signingDocType, setSigningDocType] = useState<string | null>(null);

  const selectedStudent = students.find(s => s.id === selectedStudentId);
  const school = user.schoolConfigs?.[0];

  // ─── Doc state helpers ──────────────────────────────────────────────────────
  const docKey = (docType: string) => `${selectedStudentId}::${docType}`;

  const getDocState = (docType: string): ParentDocState =>
    parentDocs[docKey(docType)] ?? {
      docType,
      status: 'draft',
      filledData: {},
      checklistSections: docType === 'checklist_4laudas' ? buildDefaultChecklistSections() : [],
      versions: [],
    };

  const setDocState = (docType: string, patch: Partial<ParentDocState>) => {
    setParentDocs(prev => ({
      ...prev,
      [docKey(docType)]: { ...getDocState(docType), ...patch },
    }));
  };

  const patchFilledData = (docType: string, id: string, value: string) => {
    const ds = getDocState(docType);
    setDocState(docType, { filledData: { ...ds.filledData, [id]: value } });
  };

  // ─── Auto-fill ao selecionar aluno ─────────────────────────────────────────
  useEffect(() => {
    if (!selectedStudent) return;

    // encaminhamento_redes → auto-fill responsável
    const ds = getDocState('encaminhamento_redes');
    if (!ds.filledData.responsavel && selectedStudent.guardianName) {
      setDocState('encaminhamento_redes', {
        filledData: {
          ...ds.filledData,
          responsavel: selectedStudent.guardianName,
          data: new Date().toISOString().split('T')[0],
        },
      });
    }

    // termo_desligamento → auto-fill datas de fichas
    const ds2 = getDocState('termo_desligamento');
    if (!ds2.filledData.data) {
      const fichas = selectedStudent.fichasComplementares || [];
      const dates  = fichas.map(f => f.createdAt).filter(Boolean).sort();
      setDocState('termo_desligamento', {
        filledData: {
          ...ds2.filledData,
          data: new Date().toISOString().split('T')[0],
          ...(dates[0] ? { primeiro_dia_atendimento: dates[0].split('T')[0] } : {}),
          ...(dates[dates.length - 1] ? { ultimo_dia_atendimento: dates[dates.length - 1].split('T')[0] } : {}),
        },
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStudentId]);

  // ─── Carrega fichas salvas do banco ao selecionar aluno ────────────────────
  useEffect(() => {
    if (!selectedStudentId || DEMO_MODE) {
      setFichaValues({});
      setSavedFichas({});
      return;
    }
    ObservationFormService.getForStudent(selectedStudentId).then(forms => {
      // forms estão ordenados por created_at DESC — o primeiro de cada tipo é o mais recente
      const valuesFromDb: Record<string, Record<string, string>> = {};
      const savedFromDb: Record<string, { code: string; savedAt: string }> = {};
      forms.forEach((form: any) => {
        if (!valuesFromDb[form.form_type]) {
          valuesFromDb[form.form_type] = form.fields_data ?? {};
          savedFromDb[form.form_type] = {
            code:    form.audit_code ?? `FICHA-${form.id.substring(0, 8).toUpperCase()}`,
            savedAt: form.created_at ?? new Date().toISOString(),
          };
        }
      });
      setFichaValues(valuesFromDb);
      setSavedFichas(savedFromDb);
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStudentId]);

  // ─── Fichas helpers ─────────────────────────────────────────────────────────
  const updateFichaField = (fichaId: string, fieldId: string, value: string) => {
    setFichaValues(prev => ({
      ...prev,
      [fichaId]: { ...(prev[fichaId] || {}), [fieldId]: value },
    }));
  };
  const getVal = (fichaId: string, fieldId: string) =>
    fichaValues[fichaId]?.[fieldId] || '';

  const handleSaveFicha = async (fichaId: string) => {
    if (!selectedStudent) { alert('Selecione um aluno antes de salvar.'); return; }
    const code  = makeAuditCode(fichaId + (selectedStudentId || ''));
    const ficha = FICHAS.find(f => f.id === fichaId);

    if (!DEMO_MODE) {
      if (!user.tenant_id) {
        alert('Erro: tenant não identificado. Faça logout e login novamente.');
        return;
      }
      if (!selectedStudentId) {
        alert('Selecione um aluno antes de salvar.');
        return;
      }
      try {
        const savedId = await ObservationFormService.save({
          tenantId:   user.tenant_id,
          studentId:  selectedStudentId,
          userId:     user.id,
          formType:   fichaId,
          title:      ficha?.title || fichaId,
          fieldsData: fichaValues[fichaId] || {},
          auditCode:  code,
          createdBy:  user.name,
          status:     'finalizado',
        });
        if (!savedId) {
          alert('Erro ao salvar no banco de dados.\nVerifique sua conexão ou contate o suporte.\n(diagnóstico: savedId=null)');
          return;
        }
        await TimelineService.add({
          tenantId:    user.tenant_id,
          studentId:   selectedStudentId,
          eventType:   'ficha',
          title:       `Ficha preenchida: ${ficha?.title || fichaId}`,
          description: `Código: ${code} — por ${user.name}`,
          linkedId:    savedId,
          linkedTable: 'observation_forms',
          icon:        'ClipboardCheck',
          author:      user.name,
        });
      } catch (e: any) {
        console.error('[FichasComplementaresView] erro ao salvar ficha:', e);
        alert(`Erro ao salvar ficha:\n${e?.message || 'Verifique o console para detalhes.'}`);
        return;
      }
    }

    setSavedFichas(prev => ({ ...prev, [fichaId]: { code, savedAt: new Date().toISOString() } }));
    alert(`Ficha salva com sucesso!\nCódigo: ${code}`);
  };

  const handlePrintFicha = async (ficha: FichaTemplate) => {
    if (!selectedStudent) { alert('Selecione um aluno primeiro.'); return; }
    const auditCode = savedFichas[ficha.id]?.code || makeAuditCode(ficha.id + selectedStudentId);
    const vals      = fichaValues[ficha.id] || {};
    setGeneratingFicha(ficha.id);
    try {
      const fields = ficha.fields.map(f => ({
        label:   f.label,
        value:   vals[f.id] || '',
        isScale: f.type === 'scale',
      }));
      const blob = await PDFGenerator.generateFicha({
        fichaTitle: ficha.title,
        fichaIcon:  ficha.icon,
        fields,
        student:    selectedStudent,
        user,
        school,
        auditCode,
      });
      PDFGenerator.download(blob, `${ficha.title}_${selectedStudent.name}_${auditCode}.pdf`);
    } catch (e) {
      console.error(e);
      alert('Erro ao gerar PDF. Tente novamente.');
    } finally {
      setGeneratingFicha(null);
    }
  };

  // ─── Documentos helpers ─────────────────────────────────────────────────────
  const handleGenerateDoc = async (docType: string) => {
    if (!selectedStudent) { alert('Selecione um aluno primeiro.'); return; }
    if (generating) return;

    const ds      = getDocState(docType);
    const code    = makeAuditCode(docType + selectedStudentId);
    const docMeta = PARENT_DOCS.find(d => d.id === docType);
    const vNum    = (ds.versions.length || 0) + 1;

    setGenerating(docType);
    try {
      const blob = await PDFGenerator.generate({
        docType,
        title:                 getDocTitle(docType),
        student:               selectedStudent,
        user,
        school,
        filledData:            ds.filledData,
        checklistSections:     ds.checklistSections,
        auditCode:             code,
        parentSignatureData:   ds.parentSignatureData,
        parentSignatureMode:   ds.parentSignatureMode ?? undefined,
        parentSignerName:      ds.parentSignerName || selectedStudent.guardianName,
      });

      const newVersion: DocVersion = {
        id:            `${docType}_${Date.now()}`,
        versionNumber: vNum,
        docType,
        title:         docMeta?.title || docType,
        auditCode:     code,
        createdAt:     new Date().toISOString(),
        createdBy:     user.name,
        fileBlob:      blob,
      };

      setDocState(docType, {
        auditCode:   code,
        generatedAt: new Date().toISOString(),
        status:      'generated',
        versions:    [...ds.versions, newVersion],
      });

      // Download automático da nova versão
      PDFGenerator.download(blob, `${docMeta?.title || docType}_${selectedStudent.name}_v${vNum}_${code}.pdf`);

      // Timeline
      if (!DEMO_MODE && user.tenant_id && selectedStudentId) {
        TimelineService.add({
          tenantId:    user.tenant_id,
          studentId:   selectedStudentId,
          eventType:   'ficha',
          title:       `Documento gerado (v${vNum}): ${docMeta?.title || docType}`,
          description: `Código: ${code} — por ${user.name}`,
          icon:        'FileText',
          author:      user.name,
        }).catch(console.error);
      }
    } catch (e) {
      console.error(e);
      alert('Erro ao gerar PDF. Verifique a conexão e tente novamente.');
    } finally {
      setGenerating(null);
    }
  };

  const handleDownloadVersion = (version: DocVersion) => {
    if (!version.fileBlob) return;
    const docMeta = PARENT_DOCS.find(d => d.id === version.docType);
    PDFGenerator.download(
      version.fileBlob,
      `${docMeta?.title || version.docType}_v${version.versionNumber}_${version.auditCode}.pdf`,
    );
  };

  // ─── Upload de cópia assinada ───────────────────────────────────────────────
  const handleUploadSignedCopy = (docType: string) => {
    pendingUploadDocType.current = docType;
    uploadInputRef.current?.click();
  };

  const handleUploadChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file    = e.target.files?.[0];
    const docType = pendingUploadDocType.current;
    if (!file || !docType) return;
    if (file.size > 10 * 1024 * 1024) { alert('Arquivo muito grande. Máximo 10 MB.'); return; }

    const reader = new FileReader();
    reader.onloadend = () => {
      const ds = getDocState(docType);
      setDocState(docType, {
        uploadedFileName: file.name,
        uploadedFileUrl:  reader.result as string,
        status:           'uploaded_signed_copy',
      });
      if (uploadInputRef.current) uploadInputRef.current.value = '';
      pendingUploadDocType.current = null;

      if (!DEMO_MODE && user.tenant_id && selectedStudentId) {
        TimelineService.add({
          tenantId:    user.tenant_id,
          studentId:   selectedStudentId,
          eventType:   'ficha',
          title:       `Cópia assinada enviada: ${PARENT_DOCS.find(d => d.id === docType)?.title || docType}`,
          description: `Arquivo: ${file.name} — por ${user.name}`,
          icon:        'Upload',
          author:      user.name,
        }).catch(console.error);
      }
    };
    reader.readAsDataURL(file);
  };

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <ClipboardCheck className="text-[#1F4E5F]" size={26} />
          Fichas & Documentos
        </h2>
        <p className="text-gray-500 text-sm mt-1">
          Fichas de observação de processo e documentos para responsáveis (PDF real).
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 p-1 rounded-xl" style={{ background: '#F6F4EF' }}>
        {(['fichas', 'documentos'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-bold transition ${
              activeTab === tab
                ? 'bg-white shadow text-[#1F4E5F]'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab === 'fichas' ? <><ClipboardCheck size={15} /> Fichas de Observação</> : <><FileText size={15} /> Documentos para Responsáveis</>}
          </button>
        ))}
      </div>

      {/* Seleção de aluno (compartilhada) */}
      <div
        className="rounded-2xl p-5 mb-6 shadow-sm"
        style={{ background: '#FFFFFF', border: '1px solid #E7E2D8' }}
      >
        <label className="text-xs font-bold text-gray-500 uppercase block mb-2">
          {activeTab === 'fichas' ? 'Aluno em Triagem' : 'Aluno'}
        </label>
        <select
          className="w-full border border-gray-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-[#1F4E5F]/30 outline-none"
          value={selectedStudentId}
          onChange={e => setSelectedStudentId(e.target.value)}
        >
          <option value="">Selecione o aluno...</option>
          {students.map(s => (
            <option key={s.id} value={s.id}>
              {s.name}{s.grade ? ` — ${s.grade}` : ''}
            </option>
          ))}
        </select>
      </div>

      {/* ─── TAB 1: FICHAS DE OBSERVAÇÃO ─────────────────────────────── */}
      {activeTab === 'fichas' && (
        <div className="space-y-4">
          {FICHAS.map(ficha => {
            const colors = COLOR_MAP[ficha.color];
            const isOpen = expandedFicha === ficha.id;
            const isSaved = !!savedFichas[ficha.id];

            return (
              <div
                key={ficha.id}
                className="rounded-2xl overflow-hidden shadow-sm transition-all"
                style={{ background: '#fff', border: `1px solid #E7E2D8` }}
              >
                {/* Topo colorido */}
                <div className="h-1" style={{ background: `linear-gradient(90deg, ${colors.accent}, #C69214)` }} />

                <button
                  className="w-full flex items-center justify-between p-5 text-left hover:bg-[#F6F4EF]/60 transition"
                  onClick={() => setExpandedFicha(isOpen ? null : ficha.id)}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{ficha.icon}</span>
                    <div>
                      <h3 className={`font-bold text-base ${colors.text}`}>{ficha.title}</h3>
                      <p className="text-xs text-gray-500 mt-0.5">{ficha.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {isSaved && (
                      <span className="flex items-center gap-1 text-[10px] font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                        <ShieldCheck size={10} /> Salvo
                      </span>
                    )}
                    {isOpen ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
                  </div>
                </button>

                {isOpen && (
                  <div className={`${colors.bg} border-t border-[#E7E2D8] p-5`}>
                    {!selectedStudent ? (
                      <div className="text-center py-6 text-sm text-gray-500">
                        ↑ Selecione um aluno acima para preencher esta ficha.
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2 mb-4 text-xs text-gray-600 bg-white/60 px-3 py-2 rounded-lg border border-white/80">
                          <span className="font-bold">{selectedStudent.name}</span>
                          <span>·</span><span>{selectedStudent.grade}</span>
                          <span>·</span>
                          <span>{(selectedStudent.diagnosis || []).join(', ') || 'Sem diagnóstico'}</span>
                        </div>

                        <div className="space-y-4">
                          {ficha.fields.map(field => (
                            <div key={field.id}>
                              <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1.5">
                                {field.label}
                              </label>

                              {field.type === 'textarea' && (
                                <AudioEnhancedTextarea
                                  fieldId={field.id}
                                  value={getVal(ficha.id, field.id)}
                                  onChange={v => updateFichaField(ficha.id, field.id, v)}
                                  placeholder={field.placeholder}
                                  rows={4}
                                />
                              )}
                              {field.type === 'text' && (
                                <input
                                  className="w-full border border-gray-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-[#1F4E5F]/30 outline-none bg-white"
                                  placeholder={field.placeholder}
                                  value={getVal(ficha.id, field.id)}
                                  onChange={e => updateFichaField(ficha.id, field.id, e.target.value)}
                                />
                              )}
                              {field.type === 'date' && (
                                <input
                                  type="date"
                                  className="border border-gray-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-[#1F4E5F]/30 outline-none bg-white"
                                  value={getVal(ficha.id, field.id)}
                                  onChange={e => updateFichaField(ficha.id, field.id, e.target.value)}
                                />
                              )}
                              {field.type === 'select' && field.id === 'presentes' && (
                                <div className="flex flex-wrap gap-2">
                                  {field.options?.map(opt => {
                                    const current: string[] = (() => { try { return JSON.parse(getVal(ficha.id, field.id) || '[]'); } catch { return []; } })();
                                    const active = current.includes(opt);
                                    return (
                                      <button key={opt} type="button"
                                        onClick={() => {
                                          const next = active ? current.filter(x => x !== opt) : [...current, opt];
                                          updateFichaField(ficha.id, field.id, JSON.stringify(next));
                                        }}
                                        className={`px-3 py-1.5 rounded-full text-xs font-bold border transition ${active ? 'border-[#1F4E5F] text-white' : 'bg-white border-gray-200 text-gray-600 hover:border-[#1F4E5F]/40'}`}
                                        style={active ? { background: '#1F4E5F' } : {}}
                                      >{opt}</button>
                                    );
                                  })}
                                </div>
                              )}
                              {field.type === 'select' && field.id !== 'presentes' && (
                                <select
                                  className="w-full border border-gray-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-[#1F4E5F]/30 outline-none bg-white"
                                  value={getVal(ficha.id, field.id)}
                                  onChange={e => updateFichaField(ficha.id, field.id, e.target.value)}
                                >
                                  <option value="">Selecione...</option>
                                  {field.options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                </select>
                              )}
                              {field.type === 'scale' && (
                                <div className="flex gap-3 items-center">
                                  {[1, 2, 3, 4, 5].map(v => (
                                    <button
                                      key={v} type="button"
                                      onClick={() => updateFichaField(ficha.id, field.id, String(v))}
                                      className={`w-10 h-10 rounded-full font-bold text-sm border-2 transition ${
                                        getVal(ficha.id, field.id) === String(v)
                                          ? 'text-white shadow-md scale-110'
                                          : 'bg-white border-gray-200 text-gray-500 hover:border-[#1F4E5F]/40'
                                      }`}
                                      style={getVal(ficha.id, field.id) === String(v) ? { background: '#1F4E5F', borderColor: '#1F4E5F' } : {}}
                                    >{v}</button>
                                  ))}
                                  <span className="text-xs text-gray-400 ml-2">
                                    {getVal(ficha.id, field.id) ? `${getVal(ficha.id, field.id)}/5` : '—'}
                                  </span>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>

                        <div className="flex gap-3 mt-6 pt-4 border-t border-white/60">
                          <button
                            onClick={() => handleSaveFicha(ficha.id)}
                            className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-xl font-bold text-sm hover:bg-black transition"
                          >
                            <Save size={14} /> Salvar Ficha
                          </button>
                          <button
                            onClick={() => handlePrintFicha(ficha)}
                            disabled={generatingFicha === ficha.id}
                            className="flex items-center gap-2 px-4 py-2 text-white rounded-xl font-bold text-sm transition disabled:opacity-60"
                            style={{ background: '#1F4E5F' }}
                          >
                            {generatingFicha === ficha.id
                              ? <><span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Gerando...</>
                              : <><Download size={14} /> Gerar PDF</>}
                          </button>
                          {isSaved && (
                            <div className="ml-auto flex items-center gap-1 text-xs text-gray-500">
                              <ShieldCheck size={12} className="text-green-600" />
                              <span className="font-mono">{savedFichas[ficha.id].code}</span>
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ─── TAB 2: DOCUMENTOS PARA RESPONSÁVEIS ──────────────────────── */}
      {activeTab === 'documentos' && (
        <>
          {!selectedStudent && (
            <div className="text-center py-12 text-gray-400">
              <FileText size={40} className="mx-auto mb-3 opacity-40" />
              <p>Selecione um aluno acima para ver os documentos disponíveis.</p>
            </div>
          )}

          {selectedStudent && (
            <div className="space-y-4">
              {PARENT_DOCS.map(doc => {
                const ds     = getDocState(doc.id);
                const isOpen = expandedDoc === doc.id;

                return (
                  <DocumentCard
                    key={doc.id}
                    icon={doc.icon}
                    title={doc.title}
                    description={doc.description}
                    category={doc.category}
                    statusLabel={STATUS_LABELS[ds.status]}
                    statusColor={STATUS_COLORS[ds.status]}
                    auditCode={ds.auditCode}
                    versionCount={ds.versions.length}
                    isOpen={isOpen}
                    onToggle={() => setExpandedDoc(isOpen ? null : doc.id)}
                  >
                    <div className="space-y-5">

                      {/* Código de auditoria */}
                      {ds.auditCode && (
                        <div className="flex items-center gap-2 text-xs text-gray-400">
                          <ShieldCheck size={12} className="text-green-500" />
                          <span className="font-mono">{ds.auditCode}</span>
                          <span>·</span>
                          <span>v{ds.versions.length}</span>
                        </div>
                      )}

                      {/* ── CHECKLIST DINÂMICO ── */}
                      {doc.id === 'checklist_4laudas' && (
                        <div className="space-y-4">
                          <div className="text-xs text-gray-500 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
                            Marque os comportamentos / características observados no aluno.
                            Use "Adicionar item" para incluir observações personalizadas.
                          </div>
                          <DynamicChecklist
                            sections={ds.checklistSections.length > 0 ? ds.checklistSections : buildDefaultChecklistSections()}
                            onChange={secs => setDocState(doc.id, { checklistSections: secs })}
                            allowAddItems={true}
                            allowAddSections={true}
                          />
                          <AudioEnhancedTextarea
                            fieldId="observacoes"
                            label="Observações Complementares"
                            value={ds.filledData.observacoes || ''}
                            onChange={v => patchFilledData(doc.id, 'observacoes', v)}
                            placeholder="Observações adicionais sobre o checklist..."
                            rows={3}
                          />
                          <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Data da Observação</label>
                            <input
                              type="date"
                              className="border border-gray-200 rounded-xl p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1F4E5F]/25"
                              value={ds.filledData.data || ''}
                              onChange={e => patchFilledData(doc.id, 'data', e.target.value)}
                            />
                          </div>
                        </div>
                      )}

                      {/* ── ENCAMINHAMENTO ÀS REDES ── */}
                      {doc.id === 'encaminhamento_redes' && (
                        <div className="space-y-3">
                          {/* Responsável legal — auto-fill */}
                          <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                              Nome do Responsável Legal
                              <span className="ml-2 text-[10px] font-normal text-[#1F4E5F] bg-[#1F4E5F]/5 px-1.5 py-0.5 rounded">auto-preenchido</span>
                            </label>
                            <input
                              type="text"
                              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1F4E5F]/25"
                              placeholder="Nome do responsável legal"
                              value={ds.filledData.responsavel || ''}
                              onChange={e => patchFilledData(doc.id, 'responsavel', e.target.value)}
                            />
                          </div>

                          {/* Setor */}
                          <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Setor</label>
                            <select
                              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1F4E5F]/25"
                              value={ds.filledData.setor || ''}
                              onChange={e => patchFilledData(doc.id, 'setor', e.target.value)}
                            >
                              <option value="">Selecione o setor...</option>
                              {SETOR_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                            </select>
                          </div>

                          {/* Serviço */}
                          <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Serviço</label>
                            <input
                              type="text"
                              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1F4E5F]/25"
                              placeholder="Nome do serviço ou unidade (ou 'Outros: ...')"
                              value={ds.filledData.servico || ''}
                              onChange={e => patchFilledData(doc.id, 'servico', e.target.value)}
                            />
                          </div>

                          {/* Motivo — multi-select */}
                          <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">
                              Motivo do Encaminhamento
                            </label>
                            <div className="flex flex-wrap gap-2 mb-2">
                              {MOTIVO_ENCAMINHAMENTO_OPTIONS.map(opt => {
                                const current = ds.filledData.motivo_opcao || '';
                                const active  = current === opt;
                                return (
                                  <button
                                    key={opt} type="button"
                                    onClick={() => patchFilledData(doc.id, 'motivo_opcao', active ? '' : opt)}
                                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
                                      active ? 'text-white border-transparent' : 'bg-white border-gray-200 text-gray-600 hover:border-[#1F4E5F]/30'
                                    }`}
                                    style={active ? { background: '#1F4E5F' } : {}}
                                  >{opt}</button>
                                );
                              })}
                            </div>
                            <AudioEnhancedTextarea
                              fieldId="motivo"
                              value={ds.filledData.motivo || ''}
                              onChange={v => patchFilledData(doc.id, 'motivo', v)}
                              placeholder="Detalhamento complementar do motivo..."
                              rows={3}
                            />
                          </div>

                          {/* Observações da equipe — áudio + chips */}
                          <AudioEnhancedTextarea
                            fieldId="observacoes_equipe"
                            label="Observações da Equipe"
                            value={ds.filledData.observacoes || ''}
                            onChange={v => patchFilledData(doc.id, 'observacoes', v)}
                            placeholder="Informações complementares da equipe sobre o caso..."
                            rows={3}
                          />

                          <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Data</label>
                            <input type="date"
                              className="border border-gray-200 rounded-xl p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1F4E5F]/25"
                              value={ds.filledData.data || ''}
                              onChange={e => patchFilledData(doc.id, 'data', e.target.value)}
                            />
                          </div>
                        </div>
                      )}

                      {/* ── CONVITE REUNIÃO ── */}
                      {doc.id === 'convite_reuniao' && (
                        <div className="space-y-3">
                          {[
                            { id: 'data_horario', label: 'Data e Horário da Reunião', type: 'text', placeholder: 'Ex: 15/03/2025 às 14h00' },
                            { id: 'local', label: 'Local', type: 'text', placeholder: school?.schoolName || 'Endereço da reunião' },
                            { id: 'pauta', label: 'Pauta / Assunto', type: 'textarea', placeholder: 'Acompanhamento pedagógico do aluno...' },
                            { id: 'profissional', label: 'Profissional Responsável', type: 'text', placeholder: user.name },
                          ].map(ff => (
                            <div key={ff.id}>
                              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">{ff.label}</label>
                              {ff.type === 'textarea'
                                ? <AudioEnhancedTextarea fieldId={ff.id} value={ds.filledData[ff.id] || ''} onChange={v => patchFilledData(doc.id, ff.id, v)} placeholder={ff.placeholder} rows={3} />
                                : <input type="text" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1F4E5F]/25" placeholder={ff.placeholder} value={ds.filledData[ff.id] || ''} onChange={e => patchFilledData(doc.id, ff.id, e.target.value)} />
                              }
                            </div>
                          ))}
                        </div>
                      )}

                      {/* ── DECLARAÇÃO DE COMPARECIMENTO ── */}
                      {doc.id === 'declaracao_comparecimento' && (
                        <div className="space-y-3">
                          <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Nome do Responsável</label>
                            <input type="text" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1F4E5F]/25" placeholder="Nome completo" value={ds.filledData.responsavel || ''} onChange={e => patchFilledData(doc.id, 'responsavel', e.target.value)} />
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Data</label>
                              <input type="date" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1F4E5F]/25" value={ds.filledData.data || ''} onChange={e => patchFilledData(doc.id, 'data', e.target.value)} />
                            </div>
                            <div>
                              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Horário</label>
                              <input type="text" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1F4E5F]/25" placeholder="Ex: 10:30" value={ds.filledData.horario || ''} onChange={e => patchFilledData(doc.id, 'horario', e.target.value)} />
                            </div>
                          </div>
                          <AudioEnhancedTextarea
                            fieldId="motivo"
                            label="Finalidade / Motivo da Visita"
                            value={ds.filledData.motivo || ''}
                            onChange={v => patchFilledData(doc.id, 'motivo', v)}
                            placeholder="Descreva a finalidade da visita do responsável..."
                            rows={3}
                          />
                        </div>
                      )}

                      {/* ── TERMO DE DESLIGAMENTO ── */}
                      {doc.id === 'termo_desligamento' && (
                        <div className="space-y-4">
                          {/* Datas de atendimento */}
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                                Primeiro dia de atendimento
                                {ds.filledData.primeiro_dia_atendimento ? (
                                  <span className="ml-1 text-[10px] font-normal text-[#1F4E5F] bg-[#1F4E5F]/5 px-1 py-0.5 rounded">auto</span>
                                ) : null}
                              </label>
                              <input type="date" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1F4E5F]/25" value={ds.filledData.primeiro_dia_atendimento || ''} onChange={e => patchFilledData(doc.id, 'primeiro_dia_atendimento', e.target.value)} />
                            </div>
                            <div>
                              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                                Último dia de atendimento
                                {ds.filledData.ultimo_dia_atendimento ? (
                                  <span className="ml-1 text-[10px] font-normal text-[#1F4E5F] bg-[#1F4E5F]/5 px-1 py-0.5 rounded">auto</span>
                                ) : null}
                              </label>
                              <input type="date" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1F4E5F]/25" value={ds.filledData.ultimo_dia_atendimento || ''} onChange={e => patchFilledData(doc.id, 'ultimo_dia_atendimento', e.target.value)} />
                            </div>
                          </div>

                          {/* Motivo — select + complemento */}
                          <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Motivo do Desligamento</label>
                            <select
                              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1F4E5F]/25 mb-2"
                              value={ds.filledData.motivo_opcao || ''}
                              onChange={e => patchFilledData(doc.id, 'motivo_opcao', e.target.value)}
                            >
                              <option value="">Selecione o motivo...</option>
                              {MOTIVO_DESLIGAMENTO_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                            </select>
                            {(ds.filledData.motivo_opcao === 'outro' || ds.filledData.motivo_complemento) && (
                              <AudioEnhancedTextarea
                                fieldId="motivo_complemento"
                                value={ds.filledData.motivo_complemento || ''}
                                onChange={v => patchFilledData(doc.id, 'motivo_complemento', v)}
                                placeholder="Descreva o motivo..."
                                rows={3}
                              />
                            )}
                          </div>

                          {/* Síntese da evolução — áudio + chips */}
                          <AudioEnhancedTextarea
                            fieldId="evolucao"
                            label="Síntese da Evolução"
                            value={ds.filledData.evolucao || ''}
                            onChange={v => patchFilledData(doc.id, 'evolucao', v)}
                            placeholder="Descreva a evolução do aluno ao longo do acompanhamento..."
                            rows={4}
                          />

                          {/* Recomendações finais — áudio + chips */}
                          <AudioEnhancedTextarea
                            fieldId="recomendacoes"
                            label="Recomendações Finais"
                            value={ds.filledData.recomendacoes || ''}
                            onChange={v => patchFilledData(doc.id, 'recomendacoes', v)}
                            placeholder="Encaminhamentos e recomendações para continuidade..."
                            rows={4}
                          />

                          <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Data do Desligamento</label>
                            <input type="date" className="border border-gray-200 rounded-xl p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1F4E5F]/25" value={ds.filledData.data || ''} onChange={e => patchFilledData(doc.id, 'data', e.target.value)} />
                          </div>
                        </div>
                      )}

                      {/* ── TERMO AEE (sem form especial) ── */}
                      {doc.id === 'termo_compromisso_aee' && (
                        <div className="space-y-3">
                          <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Data de Início no AEE</label>
                            <input type="date" className="border border-gray-200 rounded-xl p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1F4E5F]/25" value={ds.filledData.data_inicio || ''} onChange={e => patchFilledData(doc.id, 'data_inicio', e.target.value)} />
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Data</label>
                            <input type="date" className="border border-gray-200 rounded-xl p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1F4E5F]/25" value={ds.filledData.data || ''} onChange={e => patchFilledData(doc.id, 'data', e.target.value)} />
                          </div>
                        </div>
                      )}

                      {/* ── DECLARAÇÃO MATRÍCULA ── */}
                      {doc.id === 'declaracao_matricula' && (
                        <div className="space-y-3">
                          <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Data de Matrícula no AEE</label>
                            <input type="date" className="border border-gray-200 rounded-xl p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1F4E5F]/25" value={ds.filledData.data_matricula || ''} onChange={e => patchFilledData(doc.id, 'data_matricula', e.target.value)} />
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Turno do AEE</label>
                            <select className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1F4E5F]/25" value={ds.filledData.turno_aee || ''} onChange={e => patchFilledData(doc.id, 'turno_aee', e.target.value)}>
                              <option value="">Selecione...</option>
                              <option>Matutino</option>
                              <option>Vespertino</option>
                              <option>Noturno</option>
                              <option>Integral</option>
                            </select>
                          </div>
                        </div>
                      )}

                      {/* ── Assinatura do Responsável ── */}
                      <div className="rounded-xl border border-dashed border-[#1F4E5F]/30 p-4 space-y-3 bg-[#1F4E5F]/3">
                        <p className="text-xs font-bold text-[#1F4E5F] uppercase tracking-wide">
                          Assinatura do Responsável Legal
                        </p>

                        {/* Modo de assinatura */}
                        {!ds.parentSignatureMode && (
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setDocState(doc.id, { parentSignatureMode: 'digital' });
                                setSigningDocType(doc.id);
                                setShowSignaturePad(true);
                              }}
                              className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 border-2 border-[#1F4E5F]/30 text-[#1F4E5F] rounded-xl font-bold text-xs hover:bg-[#1F4E5F]/5 transition"
                            >
                              <PenLine size={13} /> Assinar no tablet/tela
                            </button>
                            <button
                              type="button"
                              onClick={() => setDocState(doc.id, { parentSignatureMode: 'manual' })}
                              className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 border-2 border-gray-200 text-gray-600 rounded-xl font-bold text-xs hover:bg-gray-50 transition"
                            >
                              <HandMetal size={13} /> Assinar em punho (impresso)
                            </button>
                          </div>
                        )}

                        {/* Assinatura digital capturada */}
                        {ds.parentSignatureMode === 'digital' && ds.parentSignatureData && (
                          <div className="space-y-2">
                            <div className="border border-green-200 rounded-xl bg-green-50 p-2">
                              <img
                                src={ds.parentSignatureData}
                                alt="Assinatura digital"
                                className="max-h-20 mx-auto"
                              />
                            </div>
                            <p className="text-[10px] text-green-700 text-center">
                              ✓ Assinatura digital capturada
                              {ds.parentSignerName ? ` — ${ds.parentSignerName}` : ''}
                            </p>
                            <div className="flex gap-2 justify-center">
                              <button
                                type="button"
                                onClick={() => { setSigningDocType(doc.id); setShowSignaturePad(true); }}
                                className="text-xs text-[#1F4E5F] underline"
                              >
                                Refazer assinatura
                              </button>
                              <span className="text-gray-300">|</span>
                              <button
                                type="button"
                                onClick={() => setDocState(doc.id, { parentSignatureMode: null, parentSignatureData: undefined, parentSignerName: undefined })}
                                className="text-xs text-red-500 underline"
                              >
                                Remover
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Aguardando assinatura digital */}
                        {ds.parentSignatureMode === 'digital' && !ds.parentSignatureData && (
                          <div className="space-y-2">
                            <button
                              type="button"
                              onClick={() => { setSigningDocType(doc.id); setShowSignaturePad(true); }}
                              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-[#1F4E5F] text-white rounded-xl font-bold text-xs hover:opacity-90 transition"
                            >
                              <PenLine size={13} /> Abrir pad de assinatura
                            </button>
                            <button
                              type="button"
                              onClick={() => setDocState(doc.id, { parentSignatureMode: null })}
                              className="w-full text-xs text-gray-400 underline text-center"
                            >
                              Cancelar
                            </button>
                          </div>
                        )}

                        {/* Assinatura em punho selecionada */}
                        {ds.parentSignatureMode === 'manual' && (
                          <div className="space-y-2">
                            <div className="border border-gray-200 rounded-xl bg-gray-50 p-4 text-center">
                              <div className="border-b border-gray-300 mx-4 mb-2 pb-8"></div>
                              <p className="text-[10px] text-gray-400">Assinatura do Responsável Legal</p>
                              <p className="text-[10px] text-gray-400 mt-1">
                                ✍️ O responsável deve assinar no documento impresso.
                              </p>
                            </div>
                            <p className="text-[10px] text-amber-600 text-center bg-amber-50 border border-amber-100 rounded-lg px-3 py-1.5">
                              O PDF será gerado com espaço para assinatura manual.
                            </p>
                            <button
                              type="button"
                              onClick={() => setDocState(doc.id, { parentSignatureMode: null })}
                              className="w-full text-xs text-gray-400 underline text-center"
                            >
                              Alterar opção de assinatura
                            </button>
                          </div>
                        )}

                        {/* Campo nome do signatário */}
                        {ds.parentSignatureMode && (
                          <input
                            type="text"
                            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1F4E5F]/25"
                            placeholder="Nome do responsável que assina..."
                            value={ds.parentSignerName || selectedStudent?.guardianName || ''}
                            onChange={e => setDocState(doc.id, { parentSignerName: e.target.value })}
                          />
                        )}
                      </div>

                      {/* ── Upload de cópia assinada ── */}
                      {ds.uploadedFileName && (
                        <div className="p-3 bg-teal-50 border border-teal-200 rounded-xl flex items-center gap-3">
                          <FileText size={18} className="text-teal-600 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-teal-700">Cópia assinada enviada</p>
                            <p className="text-xs text-teal-600 truncate">{ds.uploadedFileName}</p>
                          </div>
                          {ds.uploadedFileUrl && (
                            <a href={ds.uploadedFileUrl} download={ds.uploadedFileName} className="text-xs text-teal-600 hover:underline">
                              Baixar
                            </a>
                          )}
                        </div>
                      )}

                      {/* ── Ações ── */}
                      <div className="flex flex-wrap gap-2 pt-3 border-t border-[#E7E2D8]">
                        <button
                          onClick={() => handleGenerateDoc(doc.id)}
                          disabled={generating === doc.id}
                          className="flex items-center gap-1.5 px-4 py-2 text-white rounded-xl font-bold text-xs transition disabled:opacity-60"
                          style={{ background: '#1F4E5F' }}
                        >
                          {generating === doc.id
                            ? <><span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Gerando PDF...</>
                            : <><FilePlus size={13} /> Gerar PDF</>}
                        </button>

                        <button
                          onClick={() => handleUploadSignedCopy(doc.id)}
                          className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-700 rounded-xl font-bold text-xs hover:bg-gray-50 transition"
                        >
                          <Upload size={13} /> Upload assinado
                        </button>

                        <button
                          onClick={() => setDocState(doc.id, { showHistory: !ds.showHistory })}
                          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl font-bold text-xs transition border ${
                            ds.versions.length > 0
                              ? 'border-[#1F4E5F]/30 text-[#1F4E5F] hover:bg-[#1F4E5F]/5'
                              : 'border-gray-200 text-gray-400'
                          }`}
                        >
                          <History size={13} />
                          Histórico {ds.versions.length > 0 ? `(${ds.versions.length})` : ''}
                        </button>
                      </div>

                      {/* ── Histórico de versões ── */}
                      {ds.showHistory && (
                        <div className="mt-2 pt-4 border-t border-dashed border-[#E7E2D8]">
                          <DocumentHistory
                            versions={ds.versions}
                            onDownload={handleDownloadVersion}
                          />
                        </div>
                      )}

                    </div>
                  </DocumentCard>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Input de upload oculto */}
      <input
        ref={uploadInputRef}
        type="file"
        accept=".pdf,image/*"
        className="hidden"
        onChange={handleUploadChange}
      />

      {/* ── Modal SignaturePad do Responsável ── */}
      {showSignaturePad && signingDocType && (
        <SignaturePad
          signerName={
            getDocState(signingDocType).parentSignerName ||
            selectedStudent?.guardianName ||
            'Responsável Legal'
          }
          documentTitle={
            PARENT_DOCS.find(d => d.id === signingDocType)?.title ||
            signingDocType
          }
          onSave={(dataUrl) => {
            setDocState(signingDocType, {
              parentSignatureData: dataUrl,
              parentSignatureMode: 'digital',
              status: 'signed_digitally',
            });
            setShowSignaturePad(false);
            setSigningDocType(null);
          }}
          onCancel={() => {
            setShowSignaturePad(false);
            // Se não tem assinatura ainda, remove o modo
            if (!getDocState(signingDocType!).parentSignatureData) {
              setDocState(signingDocType!, { parentSignatureMode: null });
            }
            setSigningDocType(null);
          }}
        />
      )}
    </div>
  );
};
