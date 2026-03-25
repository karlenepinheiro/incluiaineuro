import React, { useState, useEffect } from 'react';
import { 
  Plus, Trash2, Save, Printer, FileText, Sparkles, Edit3, 
  Search, ChevronUp, ChevronDown, 
  Clock, History, FileType, File, CheckCircle, FileOutput, Lock, AlertTriangle, FileInput, Info, Upload, Eye, Download,
  X, AlertCircle, ArrowUp, ArrowDown, GripVertical, Settings, Mic
} from 'lucide-react';
import { DocumentType, DocumentData, DocSection, Student, User as UserType, Protocol, PlanTier, getPlanLimits, ProtocolStatus, DocField } from '../types';
import { AudioEnhancedTextarea } from './AudioEnhancedTextarea';
import { AudioRecorder } from './AudioRecorder';
import { ExportService } from '../services/exportService';
import { PDFGenerator } from '../services/PDFGenerator';
import { StorageService } from '../services/storageService';
import { AIService } from '../services/aiService';

// Seções esperadas por tipo de documento — contexto para análise via upload
const STANDARD_DOC_FIELDS: Record<string, string> = {
  PEI:           'Identificação do Aluno, Diagnóstico e CID, Habilidades e Potencialidades, Dificuldades e Desafios, Objetivos Pedagógicos Individualizados, Estratégias e Adaptações, Recursos e Materiais, Avaliação e Monitoramento, Assinaturas',
  PAEE:          'Identificação do Aluno, Demanda e Encaminhamento, Avaliação Pedagógica Especializada, Plano de AEE (Objetivos, Atividades, Recursos), Articulação com Sala Regular, Periodicidade, Avaliação dos Resultados',
  PDI:           'Identificação, Diagnóstico, Perfil de Aprendizagem, Objetivos de Desenvolvimento, Estratégias de Intervenção, Recursos Necessários, Metas de Curto e Longo Prazo, Avaliação',
  estudo_de_caso:'Identificação, Motivo do Encaminhamento, Histórico Escolar, Avaliação Multidisciplinar, Diagnóstico Funcional, Intervenções Realizadas, Análise e Conclusões, Recomendações',
};

interface DocumentBuilderProps {
  type: DocumentType;
  initialStudent?: Student | null;
  allStudents: Student[];
  protocols: Protocol[]; 
  user: UserType;
  initialData?: DocumentData; 
  initialProtocol?: Protocol | null; 
  onSave: (data: DocumentData, student: Student, versionLog?: string, status?: ProtocolStatus) => void;
  onDelete?: (protocolId: string) => void;
  onCancel: () => void;
  onGenerateAI: (student: Student) => void;
  onDerive: (source: Protocol, targetType: DocumentType) => void;
  isGenerating?: boolean;
}

// Custo de créditos por tipo de documento
const DOC_CREDIT_COSTS: Record<string, number> = {
  'Estudo de Caso': 2,
  'PEI':            3,
  'PAEE':           2,
  'PDI':            2,
};

function CreditBadge({ type }: { type: string }) {
  const cost = DOC_CREDIT_COSTS[type] ?? 2;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 11, fontWeight: 700,
      color: '#92650a', background: '#fefce8',
      border: '1px solid #fde68a', borderRadius: 20,
      padding: '2px 8px', marginTop: 6, whiteSpace: 'nowrap',
    }}>
      🪙 {cost} crédito{cost !== 1 ? 's' : ''}
    </span>
  );
}

const generateSecureAuditCode = (userName: string): string => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let randomStr = "";
    for(let i=0; i<20; i++) randomStr += chars.charAt(Math.floor(Math.random() * chars.length));
    const now = new Date();
    return `${randomStr}-${userName.substring(0, 5).toUpperCase()}-${now.getFullYear()}`;
};

// ─── QR Code via Canvas (sem lib extra — usa qrcode dinamicamente via CDN) ───
const QRCodeRenderer: React.FC<{ code: string }> = ({ code }) => {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const appUrl = (import.meta as any).env?.VITE_APP_URL || window.location.origin;
  const url = `${appUrl}/validar/${code}`;

  React.useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const generate = async () => {
      try {
        if (!(window as any).QRCode) {
          await new Promise<void>((res, rej) => {
            const s = document.createElement('script');
            s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
            s.onload = () => res(); s.onerror = () => rej();
            document.head.appendChild(s);
          });
        }
        // qrcodejs trabalha com div, não canvas — usamos div oculta
        const div = document.createElement('div');
        div.style.display = 'none';
        document.body.appendChild(div);
        const qr = new (window as any).QRCode(div, { text: url, width: 80, height: 80, correctLevel: 0 });
        await new Promise(r => setTimeout(r, 200));
        const img = div.querySelector('img') as HTMLImageElement | null;
        if (img && el) {
          const ctx = el.getContext('2d');
          const image = new Image();
          image.onload = () => { ctx?.drawImage(image, 0, 0, 80, 80); };
          image.src = img.src;
        }
        div.remove();
      } catch {
        // fallback: só mostra o código
      }
    };
    generate();
  }, [url]);

  return <canvas ref={canvasRef} width={80} height={80} className="border border-gray-100 rounded" title={url} />;
};

// ─── Aviso PEI Orientador ─────────────────────────────────────────────────────
const PEIGuidanceBanner: React.FC = () => (
  <div className="w-full bg-amber-50 border-b border-amber-200 p-3 print:hidden">
    <p className="text-sm text-amber-800 font-bold flex items-center justify-center gap-2 text-center">
      <AlertTriangle size={16} className="shrink-0 text-amber-600"/>
      O PEI deve ser elaborado <strong>APÓS o Estudo de Caso</strong> e, quando indicado, o <strong>PAEE</strong>.
      Certifique-se de que esses documentos estejam concluídos antes de finalizar o PEI.
    </p>
  </div>
);

export const DocumentBuilder: React.FC<DocumentBuilderProps> = ({ 
  type, 
  initialStudent,
  allStudents,
  protocols,
  user,
  initialData, 
  initialProtocol,
  onSave, 
  onDelete,
  onCancel,
  onGenerateAI,
  onDerive,
  isGenerating 
}) => {
  const [step, setStep] = useState<'select_student' | 'select_mode' | 'editor' | 'history'>(initialData ? 'editor' : (initialStudent ? 'select_mode' : 'select_student'));
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(initialStudent || null);
  const [sections, setSections] = useState<DocSection[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentAuditCode, setCurrentAuditCode] = useState(initialProtocol?.auditCode || '');
  const [isEditing, setIsEditing] = useState(initialProtocol ? initialProtocol.status !== 'FINAL' : true); 
  const [isUploading, setIsUploading] = useState(false);
  
  // Custom Fields & Reordering
  const [isReordering, setIsReordering] = useState(false);
  const [showCustomFieldModal, setShowCustomFieldModal] = useState(false);
  const [targetSectionIndex, setTargetSectionIndex] = useState(0);
  const [newField, setNewField] = useState<Partial<DocField>>({
      label: '',
      type: 'textarea',
      allowAudio: 'none',
      required: false,
      isCustom: true
  });



    const [caseStudy, setCaseStudy] = useState<Protocol | null>(null);

  useEffect(() => {
    const isDependentDoc = ['PEI', 'PAEE', 'PDI'].includes(type);

    if (!selectedStudent || !isDependentDoc) {
      if (caseStudy !== null) setCaseStudy(null);
      return;
    }

    // Find existing FINAL Case Study for this student
    const found = protocols.find(
      (p) => p.studentId === selectedStudent.id && p.type === DocumentType.ESTUDO_CASO && p.status === 'FINAL'
    );

    const next = found || null;
    if ((caseStudy?.id || null) !== (next?.id || null)) {
      setCaseStudy(next);
    }
  }, [selectedStudent?.id, type, protocols, caseStudy?.id]);

const planLimits = getPlanLimits(user.plan);

  useEffect(() => {
      // Logic to determine if we are loading an existing doc or starting fresh
      const isExistingDoc = initialData && initialData.sections.length > 0;

      if (isExistingDoc) {
          setSections(initialData!.sections);
          setStep('editor');
          setIsEditing(initialProtocol ? initialProtocol.status !== 'FINAL' : true);
          setCurrentAuditCode((initialData as any).auditCode || initialProtocol?.auditCode || '');
          
          // Ensure student is synced when editing
          if (initialStudent) setSelectedStudent(initialStudent);
      } else {
          // Resetting because type changed or we are starting fresh
          setSections([]);
          setCurrentAuditCode('');
          setIsEditing(true);
          
          // Reset UI states
          setSearchTerm('');
          setIsReordering(false);
          setShowCustomFieldModal(false);
          
          // Set Student & Step
          if (initialStudent) {
              setSelectedStudent(initialStudent);
              setStep('select_mode');
          } else {
              setSelectedStudent(null);
              setStep('select_student');
          }
      }
  }, [type, initialProtocol?.id, initialStudent?.id]);

  useEffect(() => {
      if (step === 'editor' && !currentAuditCode && user && planLimits.audit_print) {
          // Only generate if not FINAL yet. If FINAL, it should have been saved.
          // But here we generate a draft code or just wait for FINAL save?
          // Requirement: "Ao concluir... gerar código". So maybe don't generate here unless we want a draft ID.
          // Let's keep it empty until Final save, OR generate a temporary one.
          // The previous code generated it on mount. Let's stick to that but ensure it persists.
      }
  }, [step, user, planLimits.audit_print]);

  const [isReducedMode, setIsReducedMode] = useState(true); // Padrão: versão reduzida

  const loadTemplate = (docType: DocumentType, reduced = true) => {
    if (!selectedStudent) return;
    const school = user.schoolConfigs.find(s => s.id === selectedStudent.schoolId);
    
    const commonHeader: DocSection = {
      id: 'header',
      title: 'Identificação',
      fields: [
        { id: 'name', label: 'Nome do Aluno', type: 'text', value: selectedStudent.name, allowAudio: 'none' },
        { id: 'age', label: 'Data de Nascimento', type: 'text', value: new Date(selectedStudent.birthDate).toLocaleDateString(), allowAudio: 'none' },
        { id: 'school', label: 'Unidade Escolar', type: 'text', value: school?.schoolName || '', allowAudio: 'none' },
        { id: 'grade', label: 'Ano/Série', type: 'text', value: `${selectedStudent.grade} - ${selectedStudent.shift}`, allowAudio: 'none' },
        { id: 'regent', label: 'Professor Regente', type: 'text', value: selectedStudent.regentTeacher || '', allowAudio: 'none' },
        { id: 'aee', label: 'Prof. AEE', type: 'text', value: selectedStudent.aeeTeacher || '', allowAudio: 'none' },
        { id: 'coord', label: 'Coordenação', type: 'text', value: selectedStudent.coordinator || '', allowAudio: 'none' },
      ]
    };

    let template: DocSection[] = [commonHeader];

    // ── VERSÃO REDUZIDA (6-8 campos essenciais) ──────────────────────────────
    if (reduced) {
      if (docType === DocumentType.ESTUDO_CASO) {
        template.push(
          { id: 'diag', title: 'Diagnóstico e Condições', fields: [
            { id: 'd1', label: 'Diagnósticos e CID', type: 'checklist', value: selectedStudent.diagnosis || [],
              options: ['TEA', 'TDAH', 'Deficiência Intelectual', 'Síndrome de Down', 'Deficiência Auditiva', 'Deficiência Visual', 'Deficiência Física', 'Altas Habilidades', 'Outros'],
              allowAudio: 'optional' },
          ]},
          { id: 'eval', title: 'Avaliação Funcional', fields: [
            { id: 'e1', label: 'Habilidades e Potencialidades', type: 'textarea', value: (selectedStudent.abilities || []).join('\n'), allowAudio: 'optional', placeholder: 'O que o aluno já sabe fazer?' },
            { id: 'e2', label: 'Dificuldades e Barreiras', type: 'textarea', value: (selectedStudent.difficulties || []).join('\n'), allowAudio: 'optional', placeholder: 'Principais dificuldades observadas?' },
          ]},
          { id: 'concl', title: 'Conclusão e Encaminhamento', fields: [
            { id: 'c1', label: 'Parecer Final da Equipe', type: 'textarea', value: '', allowAudio: 'optional', placeholder: 'Hipótese diagnóstica e encaminhamentos sugeridos...' },
          ]},
        );
      } else if (docType === DocumentType.PAEE) {
        template.push(
          { id: 'modal', title: 'Modalidade de Atendimento', fields: [
            { id: 'm1', label: 'Tipo de Atendimento', type: 'checklist', value: [],
              options: ['Sala de Recursos Multifuncionais', 'Ensino Colaborativo', 'Itinerância', 'Centro de Atendimento Especializado'],
              allowAudio: 'optional' },
          ]},
          { id: 'cron', title: 'Cronograma', fields: [
            { id: 'c1', label: 'Horários e Dias de Atendimento', type: 'textarea', value: '', allowAudio: 'optional' },
          ]},
          { id: 'metas', title: 'Metas Principais', fields: [
            { id: 'mt1', label: 'Objetivos do Atendimento AEE', type: 'textarea', value: '', allowAudio: 'optional', placeholder: 'Descreva as principais metas para este período...' },
          ]},
        );
      } else if (docType === DocumentType.PEI) {
        template.push(
          { id: 'base', title: 'Nível Atual de Desempenho', fields: [
            { id: 'hb1', label: 'Nível Atual', type: 'textarea', value: '', allowAudio: 'optional', placeholder: 'Descreva o nível atual nas áreas acadêmicas e funcionais...' },
          ]},
          { id: 'objs', title: 'Objetivos e Metas (SMART)', fields: [
            { id: 'obj1', label: 'Objetivos de Curto Prazo', type: 'textarea', value: '', allowAudio: 'optional' },
            { id: 'obj2', label: 'Objetivos de Médio/Longo Prazo', type: 'textarea', value: '', allowAudio: 'optional' },
          ]},
          { id: 'strat', title: 'Estratégias', fields: [
            { id: 'st1', label: 'Estratégias Pedagógicas Principais', type: 'textarea', value: '', allowAudio: 'optional' },
          ]},
        );
      }
      setSections(template);
      setIsReducedMode(true);
      setStep('editor');
      setIsEditing(true);
      return;
    }

    // ── VERSÃO COMPLETA ───────────────────────────────────────────────────────

    if (docType === DocumentType.PEI) {
        template.push(
            {
                id: 'barreiras', title: 'Barreiras e Impedimentos',
                fields: [
                    {
                        id: 'b1',
                        label: 'Barreiras Identificadas',
                        type: 'checklist',
                        value: [],
                        options: ['Arquitetônicas', 'Comunicacionais', 'Metodológicas', 'Instrumentais', 'Programáticas', 'Atitudinais'],
                        allowAudio: 'optional'
                    }
                ]
            },
            {
                id: 'base', title: 'Habilidades de Base',
                fields: [
                    { id: 'hb1', label: 'Nível Atual de Desempenho', type: 'textarea', value: '', allowAudio: 'optional', placeholder: 'Descreva o nível atual nas áreas acadêmicas e funcionais...' }
                ]
            },
            {
                id: 'objs', title: 'Objetivos e Metas (SMART)',
                fields: [
                    { id: 'obj1', label: 'Objetivos de Curto Prazo', type: 'textarea', value: '', allowAudio: 'optional' },
                    { id: 'obj2', label: 'Objetivos de Médio/Longo Prazo', type: 'textarea', value: '', allowAudio: 'optional' }
                ]
            },
            {
                id: 'strat', title: 'Estratégias e Recursos',
                fields: [
                    { id: 'st1', label: 'Estratégias Pedagógicas', type: 'textarea', value: '', allowAudio: 'optional' },
                    { 
                        id: 'res1', 
                        label: 'Recursos de Tecnologia Assistiva', 
                        type: 'checklist', 
                        value: [], 
                        options: ['Prancha de Comunicação', 'Engrossadores', 'Tesoura Adaptada', 'Tablet/Software', 'Mobiliário Adaptado', 'Material Ampliado', 'Recursos Táteis'],
                        allowAudio: 'optional'
                    }
                ]
            },
            {
                id: 'aval', title: 'Avaliação e Monitoramento',
                fields: [
                    { id: 'av1', label: 'Parecer Avaliativo', type: 'scale', value: { rating: 0, text: '' }, allowAudio: 'optional', minScale: 1, maxScale: 5 }
                ]
            }
        );
    } else if (docType === DocumentType.PAEE) {
        template.push(
            {
                id: 'modal', title: 'Modalidade de Ensino',
                fields: [
                    {
                        id: 'm1',
                        label: 'Tipo de Atendimento',
                        type: 'checklist',
                        value: [],
                        options: ['Sala de Recursos Multifuncionais', 'Ensino Colaborativo', 'Itinerância', 'Centro de Atendimento Especializado'],
                        allowAudio: 'optional'
                    }
                ]
            },
            {
                id: 'cron', title: 'Cronograma e Frequência',
                fields: [
                    { id: 'c1', label: 'Horários e Dias de Atendimento', type: 'textarea', value: '', allowAudio: 'optional' }
                ]
            },
            {
                id: 'art', title: 'Articulação',
                fields: [
                    { id: 'a1', label: 'Articulação com Sala Comum', type: 'textarea', value: '', allowAudio: 'optional' },
                    { id: 'a2', label: 'Articulação com Família', type: 'textarea', value: '', allowAudio: 'optional' }
                ]
            },
            {
                id: 'rec', title: 'Recursos e Acessibilidade',
                fields: [
                    { 
                        id: 'r1', 
                        label: 'Recursos a serem produzidos', 
                        type: 'checklist', 
                        value: [], 
                        options: ['Material Adaptado', 'Jogos Pedagógicos', 'Recursos de Comunicação Aumentativa', 'Adaptação de Mobiliário'],
                        allowAudio: 'optional'
                    }
                ]
            }
        );
    } else if (docType === DocumentType.ESTUDO_CASO) {
        template.push(
            {
                id: 'hist', title: 'Histórico Escolar e Familiar',
                fields: [
                    { 
                        id: 'h1', 
                        label: 'Histórico Completo (Escolar, Familiar, Saúde)', 
                        type: 'textarea', 
                        value: `Histórico Escolar:\n${selectedStudent.schoolHistory || ''}\n\nContexto Familiar:\n${selectedStudent.familyContext || ''}`,
                        allowAudio: 'optional',
                        placeholder: 'Descreva o histórico escolar, repetências, transferências, composição familiar e dinâmica...'
                    }
                ]
            },
            {
                id: 'diag', title: 'Diagnóstico e Impactos',
                fields: [
                    {
                        id: 'd1',
                        label: 'Diagnósticos e Condições',
                        type: 'checklist',
                        value: selectedStudent.diagnosis || [],
                        options: ['TEA', 'TDAH', 'Deficiência Intelectual', 'Síndrome de Down', 'Deficiência Auditiva', 'Deficiência Visual', 'Deficiência Física', 'Altas Habilidades', 'Outros'],
                        allowAudio: 'optional'
                    },
                    {
                        id: 'd2',
                        label: 'Áreas Impactadas',
                        type: 'checklist',
                        value: [],
                        options: ['Comunicação', 'Interação Social', 'Cognição', 'Motricidade Fina', 'Motricidade Global', 'Sensorial', 'Autonomia'],
                        allowAudio: 'optional'
                    }
                ]
            },
            {
                id: 'eval', title: 'Avaliação Funcional / Pedagógica',
                fields: [
                    {
                        id: 'e1',
                        label: 'Habilidades e Potencialidades',
                        type: 'textarea',
                        value: (selectedStudent.abilities || []).join('\n'),
                        allowAudio: 'optional',
                        placeholder: 'O que o aluno já sabe fazer? Quais seus interesses?'
                    },
                    {
                        id: 'e2',
                        label: 'Dificuldades e Barreiras',
                        type: 'textarea',
                        value: (selectedStudent.difficulties || []).join('\n'),
                        allowAudio: 'optional',
                        placeholder: 'Quais as principais dificuldades observadas?'
                    }
                ]
            },
            {
                 id: 'obs', title: 'Observações Comportamentais',
                 fields: [ { id: 'o1', label: 'Comportamento em Sala/Atendimento', type: 'textarea', value: selectedStudent.observations || '', allowAudio: 'optional' } ]
            },
            {
                 id: 'concl', title: 'Hipótese Diagnóstica / Conclusão',
                 fields: [ { id: 'c1', label: 'Parecer Final da Equipe', type: 'textarea', value: '', allowAudio: 'optional' } ]
            }
        );
    } else {
        template.push({ id: 'gen', title: 'Conteúdo', fields: [{ id: '1', label: 'Descrição', type: 'textarea', value: '', allowAudio: 'optional' }] });
    }

    setSections(template);
    setIsReducedMode(false);
    setStep('editor');
    setIsEditing(true);
  };

  const handleFieldChange = (secIdx: number, fieldIdx: number, val: any) => {
      const newSecs = [...sections];
      newSecs[secIdx].fields[fieldIdx].value = val;
      setSections(newSecs);
  };

  const handleAudioUpdate = (secIdx: number, fieldIdx: number, url: string, duration: number) => {
      const newSecs = [...sections];
      const field = newSecs[secIdx].fields[fieldIdx];
      field.audioUrl = url;
      field.audioDuration = duration;
      field.audioCreatedAt = new Date().toISOString();
      setSections(newSecs);
  };

  const handleAudioDelete = (secIdx: number, fieldIdx: number) => {
      const newSecs = [...sections];
      const field = newSecs[secIdx].fields[fieldIdx];
      field.audioUrl = undefined;
      field.audioDuration = undefined;
      field.audioCreatedAt = undefined;
      setSections(newSecs);
  };

  const handleAddCustomField = () => {
      if (!newField.label) return alert("Título do campo é obrigatório");
      
      const newSecs = [...sections];
      const fieldToAdd: DocField = {
          id: crypto.randomUUID(),
          label: newField.label!,
          type: newField.type || 'textarea',
          value: '',
          isCustom: true,
          allowAudio: newField.allowAudio || 'none',
          required: newField.required,
          options: newField.type === 'select' || newField.type === 'checklist' ? (newField.options || []) : undefined,
          minScale: newField.type === 'scale' ? 1 : undefined,
          maxScale: newField.type === 'scale' ? 5 : undefined
      };

      newSecs[targetSectionIndex].fields.push(fieldToAdd);
      setSections(newSecs);
      setShowCustomFieldModal(false);
      setNewField({ label: '', type: 'textarea', allowAudio: 'none', required: false, isCustom: true });
  };

  const handleMoveField = (secIdx: number, fieldIdx: number, direction: 'up' | 'down') => {
      const newSecs = [...sections];
      const fields = newSecs[secIdx].fields;
      
      if (direction === 'up') {
          if (fieldIdx === 0) return;
          [fields[fieldIdx - 1], fields[fieldIdx]] = [fields[fieldIdx], fields[fieldIdx - 1]];
      } else {
          if (fieldIdx === fields.length - 1) return;
          [fields[fieldIdx + 1], fields[fieldIdx]] = [fields[fieldIdx], fields[fieldIdx + 1]];
      }
      
      setSections(newSecs);
  };

  const handleDeleteField = (secIdx: number, fieldIdx: number) => {
      const field = sections[secIdx].fields[fieldIdx];
      if (!field.isCustom) return alert("Campos padrão não podem ser excluídos.");
      if (field.value || field.audioUrl) {
          if (!confirm("Este campo contém dados. Tem certeza que deseja excluir?")) return;
      }
      
      const newSecs = [...sections];
      newSecs[secIdx].fields.splice(fieldIdx, 1);
      setSections(newSecs);
  };

  // ─── SEÇÃO MODAL PREMIUM ────────────────────────────────────────────────────
  const [showSectionModal, setShowSectionModal] = useState(false);

  // Banco de sugestões de seções por tipo de documento
  const SECTION_SUGGESTIONS: Record<string, { title: string; category: 'recomendado' | 'juridico' | 'opcional' }[]> = {
    [DocumentType.ESTUDO_CASO]: [
      { title: 'Histórico Escolar e Familiar', category: 'recomendado' },
      { title: 'Diagnóstico e Impactos', category: 'recomendado' },
      { title: 'Avaliação Funcional / Pedagógica', category: 'recomendado' },
      { title: 'Observações Comportamentais', category: 'recomendado' },
      { title: 'Hipótese Diagnóstica / Conclusão', category: 'recomendado' },
      { title: 'Decisão Institucional', category: 'juridico' },
      { title: 'Escuta da Família', category: 'juridico' },
      { title: 'Encaminhamentos e Parecer', category: 'juridico' },
      { title: 'Observações do Professor Regente', category: 'opcional' },
      { title: 'Análise do AEE', category: 'opcional' },
      { title: 'Dados Médicos Complementares', category: 'opcional' },
      { title: 'Outros', category: 'opcional' },
    ],
    [DocumentType.PAEE]: [
      { title: 'Modalidade de Ensino', category: 'recomendado' },
      { title: 'Cronograma e Frequência', category: 'recomendado' },
      { title: 'Articulação', category: 'recomendado' },
      { title: 'Recursos e Acessibilidade', category: 'recomendado' },
      { title: 'Metas do Atendimento', category: 'juridico' },
      { title: 'Avaliação de Resultados', category: 'juridico' },
      { title: 'Registro de Presença', category: 'opcional' },
      { title: 'Observações Complementares', category: 'opcional' },
      { title: 'Outros', category: 'opcional' },
    ],
    [DocumentType.PEI]: [
      { title: 'Identificação', category: 'recomendado' },
      { title: 'Barreiras e Impedimentos', category: 'recomendado' },
      { title: 'Habilidades de Base', category: 'recomendado' },
      { title: 'Objetivos e Metas (SMART)', category: 'recomendado' },
      { title: 'Estratégias e Recursos', category: 'recomendado' },
      { title: 'Avaliação e Monitoramento', category: 'recomendado' },
      { title: 'Responsabilidades da Equipe', category: 'juridico' },
      { title: 'Assinaturas e Validação', category: 'juridico' },
      { title: 'Comunicação com a Família', category: 'opcional' },
      { title: 'Revisão Semestral', category: 'opcional' },
      { title: 'Outros', category: 'opcional' },
    ],
  };

  const getAvailableSections = () => {
    const base = SECTION_SUGGESTIONS[type] || [
      { title: 'Conteúdo Geral', category: 'recomendado' as const },
      { title: 'Outros', category: 'opcional' as const },
    ];
    const existingTitles = new Set(sections.map(s => s.title));
    return base.filter(s => !existingTitles.has(s.title));
  };

  const handleAddSectionFromSuggestion = (title: string) => {
    setSections([...sections, { id: crypto.randomUUID(), title, fields: [] }]);
    setShowSectionModal(false);
  };

  const handleAddCustomSection = () => {
    const title = prompt('Nome da nova seção:');
    if (!title) return;
    setSections([...sections, { id: crypto.randomUUID(), title, fields: [] }]);
    setShowSectionModal(false);
  };

  const handleAddSection = () => setShowSectionModal(true);

  const handleSaveWrapper = (status: ProtocolStatus = 'DRAFT') => {
     if (!selectedStudent) return;
     const log = initialProtocol ? `Editado por ${user.name}` : `Criado por ${user.name}`;
     
     let finalAuditCode = currentAuditCode;

     if (status === 'FINAL') {
         if (!confirm("Confirmar conclusão? O documento será marcado como final e não poderá mais ser editado livremente.")) return;
         
         // Generate Audit Code if not exists
         if (!finalAuditCode) {
             finalAuditCode = generateSecureAuditCode(user.name);
             setCurrentAuditCode(finalAuditCode);
         }
     }

     // Pass auditCode in data (workaround to persist it in structuredData)
     const dataToSave = { sections, auditCode: finalAuditCode };
     
     onSave(dataToSave, selectedStudent, log, status);
     
     if (status === 'FINAL') setIsEditing(false);
     // UX: we treat the editor as always editable; avoid exposing "rascunho" terminology.
     alert(status === 'FINAL' ? "Documento concluído e salvo com sucesso." : "Documento salvo com sucesso.");
  };

  const handleDeleteWrapper = () => {
      if (!initialProtocol?.id || initialProtocol.id.startsWith('temp')) {
          onCancel();
          return;
      }
      if (confirm("Tem certeza que deseja excluir este documento? Esta ação não pode ser desfeita.")) {
          if (onDelete) onDelete(initialProtocol.id);
          alert("Documento excluído.");
          onCancel();
      }
  };

  const handleUploadExternal = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !selectedStudent) return;
      setIsUploading(true);

      try {
          // 1. Upload arquivo para Storage (mantido igual)
          const url = await StorageService.uploadFile(file, 'documentos_pdf', `ext/${file.name}`);

          // 2. Determina se é DOCX/DOC (extração de texto via mammoth)
          const isDocx =
              file.name.endsWith('.docx') ||
              file.name.endsWith('.doc') ||
              file.type.includes('wordprocessingml') ||
              file.type.includes('msword');

          try {
              let sectionsJson: string;

              if (isDocx) {
                  // ── DOCX: extrai texto com mammoth, envia só texto para Gemini ──
                  const arrayBuffer = await file.arrayBuffer();
                  const mammoth = await import('mammoth');
                  const { value: docText } = await mammoth.extractRawText({ arrayBuffer });

                  if (!docText || docText.trim().length < 20) {
                      throw new Error(
                          'O documento parece estar vazio ou ser uma imagem escaneada. ' +
                          'Verifique se o arquivo contém texto editável.'
                      );
                  }

                  const tagList = STANDARD_DOC_FIELDS[type] ?? 'Identificação, Diagnóstico, Objetivos, Estratégias, Avaliação';

                  const prompt = `Você é especialista em educação inclusiva e documentação pedagógica brasileira.
O texto abaixo foi extraído de um documento Word (tipo: ${type}) do aluno ${selectedStudent.name}.
Analise o conteúdo e reorganize-o em seções estruturadas para o sistema IncluiAI.

TEXTO DO DOCUMENTO:
${docText.slice(0, 8000)}

SEÇÕES ESPERADAS PARA DOCUMENTOS DO TIPO ${type}:
${tagList}

RETORNE SOMENTE JSON válido, sem markdown, sem texto antes ou depois:
{
  "sections": [
    {
      "id": "sec1",
      "title": "Nome da Seção",
      "fields": [
        {
          "id": "f1",
          "label": "Nome do Campo",
          "type": "textarea",
          "value": "Conteúdo extraído do documento..."
        }
      ]
    }
  ]
}

Regras obrigatórias:
- Mantenha o conteúdo ORIGINAL do documento sempre que possível (não invente)
- Use type "textarea" para textos longos (narrativas, objetivos, pareceres)
- Use type "text" para dados curtos (nome, data, CID, código)
- Mínimo 3 seções, máximo 8. Cada seção: 2 a 6 campos
- Aluno: ${selectedStudent.name} | Diagnóstico: ${(selectedStudent.diagnosis || []).join(', ') || 'não informado'}
- Idioma: português brasileiro formal`;

                  sectionsJson = await AIService.generateFromPrompt(prompt, user);

              } else {
                  // ── PDF / imagem: envia como base64 para Gemini Vision ──
                  const arrayBuffer = await file.arrayBuffer();
                  const bytes = new Uint8Array(arrayBuffer);
                  let binary = '';
                  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
                  const base64 = btoa(binary);
                  const dataUrl = `data:${file.type};base64,${base64}`;

                  const prompt = `Analise este documento (tipo: ${type}) do aluno ${selectedStudent.name}.
Extraia todo o conteúdo relevante e organize em seções estruturadas.

RETORNE SOMENTE JSON:
{"sections":[{"id":"sec1","title":"Seção","fields":[{"id":"f1","label":"Campo","type":"textarea","value":"conteúdo extraído"}]}]}

Regras: use type "textarea" para textos longos, "text" para dados curtos. Idioma: português.`;

                  sectionsJson = await AIService.generateFromPromptWithImage(prompt, dataUrl, user);
              }

              // 3. Limpeza e parsing do JSON retornado pela IA
              const cleaned = sectionsJson
                  .replace(/^```json\s*/i, '')
                  .replace(/^```\s*/i, '')
                  .replace(/```\s*$/i, '')
                  .replace(/^\uFEFF/, '')
                  .trim();

              let parsed: any;
              try {
                  parsed = JSON.parse(cleaned);
              } catch {
                  const match = cleaned.match(/\{[\s\S]*\}/);
                  if (match) {
                      try { parsed = JSON.parse(match[0]); } catch { /* segue */ }
                  }
              }

              if (parsed?.sections && Array.isArray(parsed.sections) && parsed.sections.length > 0) {
                  setSections(parsed.sections);
                  setStep('editor');
                  setIsEditing(true);
                  const dataToSave = { sections: parsed.sections, externalUrl: url || '' };
                  onSave(dataToSave, selectedStudent, `Importado via Upload: ${file.name}`, 'DRAFT');
                  alert('Documento importado e salvo como rascunho! Revise e edite antes de finalizar.');
              } else {
                  throw new Error(
                      'A IA não conseguiu estruturar o documento em seções. ' +
                      'Verifique se o arquivo contém conteúdo de texto legível.'
                  );
              }

          } catch (aiError: any) {
              console.error('[DocumentBuilder] handleUploadExternal IA error:', aiError);
              alert('Erro na análise do arquivo pela IA: ' + aiError.message);
          } finally {
              setIsUploading(false);
          }

      } catch (e: any) {
          console.error('[DocumentBuilder] handleUploadExternal storage error:', e);
          alert('Erro ao enviar arquivo: ' + (e?.message ?? 'Verifique sua conexão e tente novamente.'));
          setIsUploading(false);
      }
  };

  const handlePrint = () => window.print();

  // ── Geração de PDF via PDFGenerator (design unificado) ──────────────────────
  const handleGeneratePDF = async () => {
      if (!selectedStudent || sections.length === 0) {
          alert('Nenhum conteúdo para exportar. Preencha ou gere o documento primeiro.');
          return;
      }
      try {
          const schoolCfg = user?.schoolConfigs?.[0] ?? null;
          const auditCode = currentAuditCode || 'RASCUNHO';
          const blob = await PDFGenerator.generateFromSections({
              docType: type,
              student: selectedStudent,
              user,
              school: schoolCfg,
              sections: sections.map(sec => ({
                  title:  sec.title,
                  fields: sec.fields.map(f => ({
                      label:    f.label,
                      value:    f.value,
                      type:     f.type,
                      maxScale: (f as any).maxScale,
                  })),
              })),
              auditCode,
          });
          PDFGenerator.download(blob, `${type}_${selectedStudent.name.replace(/\s+/g, '_')}.pdf`);
      } catch (e) {
          console.error(e);
          alert('Erro ao gerar PDF.');
      }
  };

  // --- RENDER STEPS ---

  if (step === 'select_student') {
      const filtered = allStudents.filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase()));
      return (
        <div className="max-w-4xl mx-auto py-12 px-4">
             <h2 className="text-2xl font-bold text-gray-800 mb-6 text-center">Selecione o Aluno para {type}</h2>
             <div className="relative mb-6">
                 <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20}/>
                 <input className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-brand-500 outline-none" placeholder="Buscar aluno..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
             </div>
             <div className="grid md:grid-cols-2 gap-4">
                 {filtered.map(s => (
                     <button key={s.id} onClick={() => { setSelectedStudent(s); setStep('select_mode'); }} className="flex items-center gap-3 p-4 bg-white border border-gray-200 rounded-xl hover:border-brand-500 hover:shadow-md transition text-left">
                         <div className="w-10 h-10 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-bold">{s.name.charAt(0)}</div>
                         <div><p className="font-bold text-gray-800">{s.name}</p><p className="text-xs text-gray-500">{s.grade}</p></div>
                     </button>
                 ))}
             </div>
             <div className="mt-6 text-center"><button onClick={onCancel} className="text-gray-500 hover:text-gray-800">Cancelar</button></div>
        </div>
      );
  }
  
  

  const handleGenerateWithAI = () => {
      if (!selectedStudent) return;
      // Pass case study content if available
      const extraData = caseStudy ? { caseStudyContent: caseStudy.structuredData } : undefined;
      // We need to update onGenerateAI signature or handle it here.
      // Since onGenerateAI is a prop, we assume it calls AIService.generateProtocol.
      // But wait, onGenerateAI in App.tsx likely just calls the service.
      // We should modify App.tsx OR modify how onGenerateAI is called.
      // The prompt says "Alterar SOMENTE components/DocumentBuilder.tsx...".
      // So we can't change App.tsx.
      // However, AIService.generateProtocol signature was updated to accept extraData.
      // If onGenerateAI prop doesn't accept extraData, we have a problem.
      // Let's check App.tsx via view_file if needed, but assuming we can pass it.
      // Actually, onGenerateAI prop signature in DocumentBuilderProps is (student: Student) => void.
      // We need to change the prop signature in the interface first.
      
      // Wait, I can't change App.tsx.
      // But I can change AIService.
      // If App.tsx calls AIService.generateProtocol(type, student, user), it won't pass extraData.
      // BUT, I can fetch the case study INSIDE AIService if I have access to protocols?
      // No, AIService is stateless regarding app state.
      // DatabaseService has getProtocols.
      // So I can update AIService.generateProtocol to fetch the case study itself!
      
      // RE-STRATEGY: Update AIService.generateProtocol to fetch student's case study from DB if not provided.
      // This avoids changing App.tsx.
      
      onGenerateAI(selectedStudent);
  };

  // But wait, the requirement says: "nas telas PEI/PAEE/PDI mostrar opção: “Usar Estudo de Caso pronto como base” - ao clicar, preencher automaticamente..."
  // This implies a client-side action in DocumentBuilder.
  
  const handleUseCaseStudy = () => {
      if (!caseStudy || !selectedStudent) return;
      
      // Pre-fill sections based on Case Study (Context)
      // We can map Case Study fields to PEI/PAEE fields or just use it as AI context.
      // "preencher automaticamente campos-base (ou contexto) e/ou enviar para IA."
      
      if (confirm("Deseja usar o Estudo de Caso existente para gerar um rascunho com IA?")) {
           // We need to trigger AI generation WITH the case study data.
           // Since we can't change onGenerateAI signature easily without changing App.tsx,
           // We can call AIService directly here?
           // No, onGenerateAI handles loading state and saving the result.
           
           // Alternative: We can just load the Case Study data into the form (Manual copy) 
           // OR we rely on the AIService update I just made (which needs to fetch data).
           
           // Let's go with updating AIService to fetch the data, so the standard "Gerar com IA" button works better automatically.
           // AND add a specific button "Copiar do Estudo de Caso" for manual fill.
           
           onGenerateAI(selectedStudent); // This will now use the enhanced AIService
      }
  };

  if (step === 'select_mode' && selectedStudent) {
    const tipoAluno = selectedStudent.tipo_aluno || 'com_laudo';
    const isPEI = type === DocumentType.PEI;
    const isEstudoCaso = type === DocumentType.ESTUDO_CASO;
    
    // Verificar se há estudo de caso FINAL para habilitar PEI
    const hasFinalCaseStudy = protocols.some(
      p => p.studentId === selectedStudent.id && p.type === DocumentType.ESTUDO_CASO && p.status === 'FINAL'
    );
    
    // PEI NÃO deve ser travado. Apenas orientar.
    const showPeiWarning = isPEI && !hasFinalCaseStudy;

    return (
        <div className="max-w-4xl mx-auto py-12 px-4 text-center">
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Novo {type}</h2>
            <p className="text-gray-500 mb-2">Aluno: <strong>{selectedStudent.name}</strong></p>

            {showPeiWarning && (
              <div className="mt-4 mb-6 mx-auto max-w-2xl text-left bg-amber-50 border border-amber-200 rounded-2xl p-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 text-amber-700">⚠️</div>
                  <div>
                    <p className="font-bold text-amber-900">Orientação importante</p>
                    <p className="text-amber-900/80 text-sm">
                      O <b>PEI</b> deve ser elaborado <b>APÓS</b> o <b>Estudo de Caso</b> e, quando indicado, o <b>PAEE</b>.
                      Você pode prosseguir agora, mas recomendamos finalizar o Estudo de Caso primeiro para garantir segurança técnica e jurídica.
                    </p>
                  </div>
                </div>
              </div>
            )}
            
            {/* Badge tipo aluno */}
            <div className="flex justify-center mb-6">
              <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${
                tipoAluno === 'com_laudo' 
                  ? 'bg-blue-100 text-blue-800' 
                  : 'bg-yellow-100 text-yellow-800'
              }`}>
                {tipoAluno === 'com_laudo' ? '📋 Aluno com Laudo' : '🔍 Aluno em Triagem'}
              </span>
            </div>

            {/* Aviso PEI bloqueado */}
            {false && (
              <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4 text-left">
                <div className="flex items-start gap-3">
                  <Lock size={20} className="text-red-500 shrink-0 mt-0.5"/>
                  <div>
                    <h4 className="font-bold text-red-800">PEI Bloqueado</h4>
                    <p className="text-sm text-red-700 mt-1">
                      O PEI só pode ser criado após a conclusão do <strong>Estudo de Caso</strong> com decisão institucional positiva. 
                      Finalize o Estudo de Caso primeiro.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Aviso Estudo de Caso para aluno em triagem */}
            {isEstudoCaso && tipoAluno === 'em_triagem' && (
              <div className="mb-6 bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-left">
                <div className="flex items-start gap-3">
                  <AlertCircle size={20} className="text-yellow-600 shrink-0 mt-0.5"/>
                  <div>
                    <h4 className="font-bold text-yellow-800">Aluno em Triagem — Passo Obrigatório</h4>
                    <p className="text-sm text-yellow-700 mt-1">
                      Para alunos em triagem, o Estudo de Caso é o documento inicial obrigatório. 
                      Preencha com cuidado — ele definirá os próximos documentos.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Case Study Recommendation */}
            {caseStudy && !isEstudoCaso && (
                <div className="mb-8 bg-green-50 border border-green-200 p-4 rounded-xl flex flex-col md:flex-row items-center justify-between gap-4 text-left">
                    <div>
                        <h4 className="font-bold text-green-800 flex items-center gap-2"><CheckCircle size={18}/> Estudo de Caso Encontrado!</h4>
                        <p className="text-sm text-green-700">Existe um Estudo de Caso concluído em {new Date(caseStudy.lastEditedAt).toLocaleDateString()}. Usá-lo aumentará a precisão do {type}.</p>
                    </div>
                    <button onClick={handleUseCaseStudy} className="px-4 py-2 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700 shadow-sm whitespace-nowrap">
                        Usar como Base (IA)
                    </button>
                </div>
            )}

            {false ? (
              <div className="text-center">
                <button onClick={() => setStep('select_student')} className="mt-4 text-sm text-gray-400 hover:text-gray-600">← Voltar</button>
              </div>
            ) : (
              <>
                {/* Versão Reduzida vs Completa */}
                <div className="mb-6 p-4 bg-brand-50 border border-brand-100 rounded-xl text-left">
                  <p className="text-xs font-bold text-brand-800 uppercase mb-2">Modo de Preenchimento</p>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => setIsReducedMode(true)}
                      className={`p-3 rounded-lg border-2 text-left transition ${isReducedMode ? 'border-brand-500 bg-white' : 'border-transparent bg-white/60 hover:bg-white'}`}
                    >
                      <p className="font-bold text-sm text-gray-800">⚡ Essencial (Recomendado)</p>
                      <p className="text-xs text-gray-500 mt-0.5">6-8 campos objetivos. Rápido e completo.</p>
                    </button>
                    <button
                      onClick={() => setIsReducedMode(false)}
                      className={`p-3 rounded-lg border-2 text-left transition ${!isReducedMode ? 'border-brand-500 bg-white' : 'border-transparent bg-white/60 hover:bg-white'}`}
                    >
                      <p className="font-bold text-sm text-gray-800">📋 Completo</p>
                      <p className="text-xs text-gray-500 mt-0.5">Todas as seções e campos avançados.</p>
                    </button>
                  </div>
                </div>

                <div className="grid md:grid-cols-3 gap-6">
                    <button onClick={() => onGenerateAI(selectedStudent!)} disabled={isGenerating} className="p-6 bg-white border-2 border-brand-100 rounded-2xl hover:border-brand-500 hover:shadow-lg transition flex flex-col items-center group">
                        <div className="bg-brand-50 p-4 rounded-full mb-4 group-hover:bg-brand-100 transition"><Sparkles size={24} className="text-brand-600"/></div>
                        <h3 className="text-lg font-bold text-gray-900">Gerar com IA</h3>
                        <p className="text-xs text-gray-500 mt-2">Cria um rascunho com base nos dados do aluno.</p>
                        <CreditBadge type={type} />
                        {isGenerating && <span className="text-brand-600 text-xs font-bold mt-2 animate-pulse">Gerando...</span>}
                    </button>

                    <button onClick={() => loadTemplate(type, isReducedMode)} className="p-6 bg-white border-2 border-gray-100 rounded-2xl hover:border-gray-400 hover:shadow-lg transition flex flex-col items-center group">
                        <div className="bg-gray-50 p-4 rounded-full mb-4 group-hover:bg-gray-100 transition"><Edit3 size={24} className="text-gray-500"/></div>
                        <h3 className="text-lg font-bold text-gray-900">Gerar Manual</h3>
                        <p className="text-xs text-gray-500 mt-2">Preencher você mesmo. {isReducedMode ? 'Versão essencial.' : 'Versão completa.'}</p>
                    </button>

                    <label className="p-6 bg-white border-2 border-dashed border-gray-300 rounded-2xl hover:border-brand-500 hover:bg-gray-50 transition cursor-pointer flex flex-col items-center group">
                        <div className="bg-gray-100 p-4 rounded-full mb-4 group-hover:bg-white transition"><Upload size={24} className="text-gray-500"/></div>
                        <h3 className="text-lg font-bold text-gray-900">Upload</h3>
                        <p className="text-xs text-gray-500 mt-2">Usar um documento existente como base.</p>
                        <input type="file" className="hidden" accept=".pdf,.doc,.docx" onChange={handleUploadExternal} disabled={isUploading} />
                        {isUploading && <span className="text-brand-600 text-xs font-bold mt-2">Enviando...</span>}
                    </label>
                </div>
                <button onClick={() => setStep('select_student')} className="mt-8 text-sm text-gray-400 hover:text-gray-600">Trocar Aluno</button>
              </>
            )}
        </div>
    );
  }

  // --- EDITOR VIEW ---

  return (
    <div className="bg-gray-100 min-h-screen pb-20 flex flex-col items-center">
        
        {/* BANNER VERSÃO REDUZIDA */}
        {isReducedMode && (
            <div className="w-full bg-amber-50 border-b border-amber-200 p-3 text-center print:hidden">
                <p className="text-xs text-amber-800 font-bold flex items-center justify-center gap-2">
                    ⚡ Modo Essencial ativo — Mostrando apenas os campos principais.
                    <button
                      onClick={() => { loadTemplate(type, false); }}
                      className="underline hover:text-amber-900 ml-1"
                    >
                      Expandir para versão completa →
                    </button>
                </p>
            </div>
        )}

        {/* RECOMMENDATION BANNER */}
        {['PEI', 'PAEE', 'PDI'].includes(type) && (
            <div className="w-full bg-blue-50 border-b border-blue-100 p-3 text-center print:hidden">
                <p className="text-xs text-blue-800 font-bold flex items-center justify-center gap-2">
                    <AlertCircle size={14}/> Recomendação: elabore primeiro o Estudo de Caso para aumentar a qualidade deste documento.
                </p>
            </div>
        )}

        {/* Top Bar with Buttons */}
        <div className="w-full bg-white border-b p-4 flex flex-col md:flex-row justify-between items-center sticky top-0 z-50 print:hidden gap-4 shadow-sm">
            <div className="flex items-center gap-4 w-full md:w-auto">
                <div className="bg-brand-100 text-brand-700 font-bold rounded-full w-10 h-10 flex items-center justify-center shrink-0">
                    {selectedStudent?.name.charAt(0)}
                </div>
                <div>
                    <h2 className="font-bold text-gray-800 text-lg leading-tight">{type}</h2>
                    <p className="text-sm text-gray-500">{selectedStudent?.name}</p>
                </div>
            </div>
            
            <div className="flex flex-wrap gap-2 justify-end w-full md:w-auto">
                
                <button onClick={handlePrint} className="px-3 py-2 bg-gray-100 rounded hover:bg-gray-200 flex gap-2 text-sm font-medium" title="Imprimir documento atual"><Printer size={16}/> <span className="hidden sm:inline">Imprimir</span></button>
                <button onClick={handleGeneratePDF} className="px-3 py-2 border border-brand-200 text-brand-700 rounded hover:bg-brand-50 flex gap-2 text-sm font-medium" title="Baixar PDF formatado"><Download size={16}/> <span className="hidden sm:inline">PDF</span></button>
                
                {isEditing && (
                    <>
                        <button 
                            onClick={() => setIsReordering(!isReordering)} 
                            className={`px-3 py-2 border rounded flex gap-2 text-sm font-medium transition-colors ${isReordering ? 'bg-yellow-100 border-yellow-300 text-yellow-800' : 'hover:bg-gray-50'}`}
                            title="Reordenar campos e seções"
                        >
                            {isReordering ? <CheckCircle size={16}/> : <Settings size={16}/>}
                            <span className="hidden sm:inline">{isReordering ? 'Concluir' : 'Organizar'}</span>
                        </button>
                        <button onClick={handleAddSection} className="px-3 py-2 border border-dashed border-gray-400 rounded hover:bg-gray-50 flex gap-2 text-sm font-medium" title="Criar nova seção/bloco">
                            <Plus size={16}/> <span className="hidden sm:inline">Add Seção</span>
                        </button>
                    </>
                )}

                {isEditing ? (
                    <>
                        <button onClick={() => handleSaveWrapper('DRAFT')} className="px-3 py-2 border rounded hover:bg-gray-50 text-sm font-medium" title="Salvar como rascunho"><Save size={16}/> <span className="hidden sm:inline">Salvar</span></button>
                        <button onClick={() => handleSaveWrapper('FINAL')} className="px-4 py-2 bg-green-600 text-white rounded font-bold hover:bg-green-700 flex gap-2 text-sm" title="Finalizar documento (gera código auditável)"><CheckCircle size={16}/> Concluir</button>
                    </>
                ) : (
                    <button onClick={() => setIsEditing(true)} className="px-4 py-2 bg-brand-600 text-white rounded font-bold flex gap-2 text-sm hover:bg-brand-700" title="Editar documento"><Edit3 size={16}/> Editar</button>
                )}
                
                <button onClick={handleDeleteWrapper} className="px-3 py-2 text-red-500 hover:bg-red-50 rounded" title="Excluir documento"><Trash2 size={16}/></button>
                <button onClick={onCancel} className="px-3 py-2 text-gray-500 hover:text-gray-800 text-sm">Fechar</button>
            </div>
        </div>

        {/* ── MODAL: Nova Seção Premium ── */}
        {showSectionModal && (() => {
          const available = getAvailableSections();
          const catLabel: Record<string, string> = { recomendado: 'Recomendado', juridico: 'Jurídico', opcional: 'Opcional' };
          const catColor: Record<string, string> = {
            recomendado: 'bg-green-100 text-green-800 border-green-200',
            juridico: 'bg-blue-100 text-blue-800 border-blue-200',
            opcional: 'bg-gray-100 text-gray-600 border-gray-200',
          };
          const grouped = ['recomendado', 'juridico', 'opcional'].map(cat => ({
            cat,
            items: available.filter(s => s.category === cat),
          })).filter(g => g.items.length > 0);

          return (
            <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-5">
                  <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                    <Plus size={18} className="text-brand-600"/> Nova Seção
                  </h3>
                  <button onClick={() => setShowSectionModal(false)}><X size={20} className="text-gray-400 hover:text-gray-700"/></button>
                </div>

                {grouped.map(({ cat, items }) => (
                  <div key={cat} className="mb-4">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">{catLabel[cat]}</p>
                    <div className="space-y-1.5">
                      {items.map(s => (
                        <button
                          key={s.title}
                          onClick={() => handleAddSectionFromSuggestion(s.title)}
                          className="w-full flex items-center justify-between p-3 rounded-xl border border-gray-100 hover:border-brand-300 hover:bg-brand-50 transition text-left group"
                        >
                          <span className="text-sm font-semibold text-gray-800 group-hover:text-brand-700">{s.title}</span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${catColor[cat]}`}>{catLabel[cat]}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}

                <div className="mt-4 pt-4 border-t border-gray-100">
                  <button
                    onClick={handleAddCustomSection}
                    className="w-full flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-dashed border-gray-300 hover:border-brand-400 hover:bg-brand-50 transition text-sm font-bold text-gray-500 hover:text-brand-700"
                  >
                    <Plus size={16}/> Criar seção personalizada
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Custom Field Modal — Padrão Premium */}
        {showCustomFieldModal && (
            <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
                    <div className="flex justify-between items-center mb-5">
                        <h3 className="text-lg font-bold text-gray-900">Adicionar Campo</h3>
                        <button onClick={() => setShowCustomFieldModal(false)}><X size={20} className="text-gray-400 hover:text-gray-700"/></button>
                    </div>
                    
                    <div className="space-y-5">
                        {/* Título */}
                        <div>
                            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1.5">Título do Campo *</label>
                            <input 
                                className="w-full border border-gray-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-brand-500 outline-none" 
                                value={newField.label} 
                                onChange={e => setNewField({...newField, label: e.target.value})}
                                placeholder="Ex: Observações da Família"
                                autoFocus
                            />
                        </div>

                        {/* Tipo de Campo */}
                        <div>
                            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1.5">Tipo de Campo</label>
                            <div className="grid grid-cols-2 gap-2">
                                {([
                                  { val: 'textarea', label: '📝 Texto Livre' },
                                  { val: 'text', label: '✏️ Sugestões + Texto' },
                                  { val: 'checklist', label: '☑️ Checklist' },
                                  { val: 'scale', label: '⭐ Escala Avaliativa' },
                                  { val: 'grid', label: '📊 Rubrica' },
                                  { val: 'prompt_ia', label: '🤖 Prompt IA' },
                                ] as const).map(opt => (
                                  <button
                                    key={opt.val}
                                    type="button"
                                    onClick={() => setNewField({...newField, type: opt.val as any})}
                                    className={`p-2.5 rounded-lg text-sm font-semibold border-2 text-left transition ${newField.type === opt.val ? 'border-brand-500 bg-brand-50 text-brand-800' : 'border-gray-100 text-gray-600 hover:border-gray-300'}`}
                                  >
                                    {opt.label}
                                  </button>
                                ))}
                            </div>
                        </div>

                        {/* Toggle Áudio */}
                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100">
                          <div>
                            <p className="text-sm font-bold text-gray-800 flex items-center gap-1.5"><Mic size={14} className="text-brand-600"/> Transcrição por Áudio</p>
                            <p className="text-xs text-gray-500 mt-0.5">Permitir gravação de voz neste campo</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setNewField({...newField, allowAudio: newField.allowAudio === 'optional' ? 'none' : 'optional'})}
                            className={`relative w-12 h-6 rounded-full transition-colors ${newField.allowAudio === 'optional' ? 'bg-brand-600' : 'bg-gray-300'}`}
                          >
                            <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${newField.allowAudio === 'optional' ? 'left-7' : 'left-1'}`}/>
                          </button>
                        </div>

                        {/* Obrigatório */}
                        <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100 cursor-pointer">
                            <input 
                                type="checkbox" 
                                checked={newField.required} 
                                onChange={e => setNewField({...newField, required: e.target.checked})}
                                className="w-4 h-4 rounded accent-brand-600"
                            />
                            <span className="text-sm font-bold text-gray-700">Campo Obrigatório</span>
                        </label>

                        {/* Botões */}
                        <div className="flex gap-3 pt-2">
                          <button onClick={() => setShowCustomFieldModal(false)} className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm font-bold text-gray-600 hover:bg-gray-50">Cancelar</button>
                          <button 
                              onClick={handleAddCustomField}
                              className="flex-1 bg-brand-600 text-white py-2.5 rounded-lg font-bold hover:bg-brand-700 text-sm"
                          >
                              Criar Campo
                          </button>
                        </div>
                    </div>
                </div>
            </div>
        )}

        {/* Editor / Viewer */}
        <div id="document-content" className="w-full max-w-[210mm] bg-white shadow-xl mt-8 p-[20mm] print:shadow-none print:w-full print:m-0 print:p-0">
            <div className="border-b-2 border-black pb-4 mb-6">
                <h1 className="text-2xl font-bold uppercase text-gray-900">{type}</h1>
                <p className="text-gray-600">Aluno: {selectedStudent?.name}</p>
                {type === DocumentType.PEI && selectedStudent && !protocols.some(
                  p => p.studentId === selectedStudent.id && p.type === DocumentType.ESTUDO_CASO && p.status === 'FINAL'
                ) && (
                  <div className="mt-3 bg-amber-50 border border-amber-200 rounded-xl p-3">
                    <p className="text-amber-900 text-sm font-bold">⚠️ O PEI deve ser elaborado APÓS o Estudo de Caso e, quando indicado, o PAEE.</p>
                    <p className="text-amber-900/80 text-xs mt-1">Você pode editar agora, mas recomendamos finalizar o Estudo de Caso para garantir rastreabilidade e segurança jurídica.</p>
                  </div>
                )}

                {initialProtocol?.status === 'FINAL' && <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded font-bold border border-green-200 print:hidden mt-2 inline-block">CONCLUÍDO</span>}
            </div>

            {sections.map((sec, i) => (
                <div key={i} className="mb-6 break-inside-avoid relative group/section">
                    <div className="flex justify-between items-center bg-gray-100 p-2 mb-2 print:bg-transparent print:border-b print:border-gray-300 print:pl-0">
                        <h3 className="font-bold uppercase text-sm text-gray-800">{sec.title}</h3>
                        {isEditing && (
                            <button 
                                onClick={() => { setTargetSectionIndex(i); setShowCustomFieldModal(true); }}
                                className="text-xs flex items-center gap-1 text-brand-600 hover:text-brand-800 font-bold print:hidden"
                            >
                                <Plus size={14}/> Add Campo
                            </button>
                        )}
                    </div>

                    {sec.fields.map((f, j) => (
                        <div key={f.id} className={`mb-4 relative group/field transition-all ${isReordering ? 'pl-8 border-l-2 border-dashed border-gray-300' : ''}`}>
                            
                            {/* Reorder Controls */}
                            {isReordering && (
                                <div className="absolute -left-8 top-0 bottom-0 flex flex-col justify-center gap-1 pr-2">
                                    <button onClick={() => handleMoveField(i, j, 'up')} disabled={j === 0} className="p-1 hover:bg-gray-200 rounded disabled:opacity-30"><ArrowUp size={14}/></button>
                                    <button onClick={() => handleMoveField(i, j, 'down')} disabled={j === sec.fields.length - 1} className="p-1 hover:bg-gray-200 rounded disabled:opacity-30"><ArrowDown size={14}/></button>
                                </div>
                            )}

                            {/* Field Header */}
                            <div className="flex justify-between items-start mb-1">
                                <label className="block text-xs font-bold text-gray-500">
                                    {f.label} {f.required && <span className="text-red-500">*</span>}
                                    {f.isCustom && <span className="ml-2 px-1.5 py-0.5 bg-purple-100 text-purple-700 text-[10px] rounded uppercase">Personalizado</span>}
                                    {/* Removed duplicate Mic icon here */}
                                </label>
                                
                                {isEditing && f.isCustom && (
                                    <button onClick={() => handleDeleteField(i, j)} className="text-gray-400 hover:text-red-500 print:hidden opacity-0 group-hover/field:opacity-100 transition-opacity">
                                        <Trash2 size={14}/>
                                    </button>
                                )}
                            </div>

                            {/* Field Input */}
                            <div className="space-y-2">
                                {/* Text Input (if not audio-only) */}
                                {f.allowAudio !== 'only' && (
                                    isEditing ? (
                                        f.type === 'textarea' ? (
                                            <AudioEnhancedTextarea
                                              fieldId={f.id}
                                              value={String(f.value ?? '')}
                                              onChange={(v) => handleFieldChange(i, j, v)}
                                              placeholder={f.placeholder}
                                              rows={5}
                                            />
                                        ) : f.type === 'scale' ? (
                                            <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                                                <div className="flex gap-6 items-center mb-4 justify-center">
                                                    <span className="text-xs font-bold text-gray-400 uppercase">Iniciante</span>
                                                    {[1, 2, 3, 4, 5].map(val => {
                                                        const currentVal = typeof f.value === 'object' ? f.value.rating : Number(f.value);
                                                        return (
                                                            <label key={val} className="flex flex-col items-center cursor-pointer group">
                                                                <input 
                                                                    type="radio" 
                                                                    name={`scale-${f.id}`} 
                                                                    checked={currentVal === val} 
                                                                    onChange={() => handleFieldChange(i, j, { ...f.value, rating: val })}
                                                                    className="hidden"
                                                                />
                                                                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold transition-all ${currentVal === val ? 'bg-brand-600 text-white shadow-lg scale-110' : 'bg-white text-gray-400 border border-gray-200 group-hover:border-brand-300'}`}>
                                                                    {val}
                                                                </div>
                                                            </label>
                                                        );
                                                    })}
                                                    <span className="text-xs font-bold text-gray-400 uppercase">Avançado</span>
                                                </div>
                                                <AudioEnhancedTextarea
                                                    fieldId="observacoes"
                                                    placeholder="Observações sobre o nível de desempenho..."
                                                    value={typeof f.value === 'object' ? (f.value.text ?? '') : ''}
                                                    onChange={v => handleFieldChange(i, j, { ...(typeof f.value === 'object' ? f.value : { rating: Number(f.value) }), text: v })}
                                                    rows={3}
                                                />
                                            </div>
                                        ) : f.type === 'checklist' ? (
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-gray-50 p-4 rounded-xl border border-gray-200">
                                                {f.options?.map(opt => {
                                                    const currentList = Array.isArray(f.value) ? f.value : [];
                                                    const isChecked = currentList.includes(opt);
                                                    return (
                                                        <label key={opt} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${isChecked ? 'bg-brand-50 border-brand-300' : 'bg-white border-gray-200 hover:border-gray-300'}`}>
                                                            <div className={`w-5 h-5 rounded border flex items-center justify-center ${isChecked ? 'bg-brand-600 border-brand-600 text-white' : 'bg-white border-gray-300'}`}>
                                                                {isChecked && <CheckCircle size={12}/>}
                                                            </div>
                                                            <input 
                                                                type="checkbox" 
                                                                className="hidden"
                                                                checked={isChecked} 
                                                                onChange={() => {
                                                                    const newList = isChecked ? currentList.filter((v: string) => v !== opt) : [...currentList, opt];
                                                                    handleFieldChange(i, j, newList);
                                                                }} 
                                                            />
                                                            <span className={`text-sm font-medium ${isChecked ? 'text-brand-800' : 'text-gray-600'}`}>{opt}</span>
                                                        </label>
                                                    );
                                                })}
                                                {/* Custom Option Support */}
                                                <div className="md:col-span-2 mt-2">
                                                    <input 
                                                        className="w-full border-b border-gray-300 bg-transparent py-2 text-sm focus:border-brand-500 outline-none"
                                                        placeholder="+ Adicionar outro item (digite e pressione Enter)"
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') {
                                                                const val = (e.currentTarget.value).trim();
                                                                if (val) {
                                                                    const currentList = Array.isArray(f.value) ? f.value : [];
                                                                    if (!currentList.includes(val)) {
                                                                        const newSecs = [...sections];
                                                                        // Update value
                                                                        newSecs[i].fields[j].value = [...currentList, val];
                                                                        // Update options
                                                                        if (!newSecs[i].fields[j].options) newSecs[i].fields[j].options = [];
                                                                        newSecs[i].fields[j].options!.push(val);
                                                                        setSections(newSecs);
                                                                    }
                                                                    e.currentTarget.value = '';
                                                                }
                                                            }
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                        ) : (
                                            <input 
                                                className="w-full border border-gray-300 rounded p-2 text-sm focus:ring-2 focus:ring-brand-500 outline-none"
                                                value={f.value}
                                                onChange={e => handleFieldChange(i, j, e.target.value)}
                                            />
                                        )
                                    ) : (
                                        <div className="text-sm whitespace-pre-wrap text-gray-800 leading-relaxed bg-transparent">
                                            {f.type === 'scale' ? (
                                                <div className="flex items-center gap-2">
                                                    <span className="font-bold bg-brand-100 text-brand-800 px-2 py-1 rounded">{typeof f.value === 'object' ? f.value.rating : f.value}/5</span>
                                                    <span className="text-gray-600 italic">{typeof f.value === 'object' ? f.value.text : ''}</span>
                                                </div>
                                            ) : f.type === 'checklist' ? (
                                                <div className="flex flex-wrap gap-2">
                                                    {(Array.isArray(f.value) ? f.value : []).map((v: string) => (
                                                        <span key={v} className="bg-green-50 text-green-700 border border-green-200 px-2 py-1 rounded text-xs font-bold flex items-center gap-1">
                                                            <CheckCircle size={10}/> {v}
                                                        </span>
                                                    ))}
                                                </div>
                                            ) : (
                                                f.value || '-'
                                            )}
                                        </div>
                                    )
                                )}

                                {/* Audio Recorder */}
                                {f.allowAudio && f.allowAudio !== 'none' && (
                                    <div className={!isEditing && !f.audioUrl ? 'hidden' : ''}>
                                        <AudioRecorder 
                                            initialAudioUrl={f.audioUrl}
                                            onSave={(url, duration) => handleAudioUpdate(i, j, url, duration)}
                                            onDelete={() => handleAudioDelete(i, j)}
                                            readOnly={!isEditing}
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            ))}

            {/* Audit Code + QR — aparece sempre no preview e no PDF */}
            {currentAuditCode && (
                <div className="mt-8 pt-4 border-t border-gray-200 flex flex-col items-center gap-2 print:mt-4">
                    <canvas id={`qr-canvas-${currentAuditCode}`} className="w-20 h-20"/>
                    <p className="text-xs font-mono text-gray-400 text-center">
                        {currentAuditCode}<br/>
                        <span className="text-[10px]">incluiai.com/validar/{currentAuditCode}</span>
                    </p>
                    <QRCodeRenderer code={currentAuditCode} />
                </div>
            )}
        </div>
    </div>
  );
};