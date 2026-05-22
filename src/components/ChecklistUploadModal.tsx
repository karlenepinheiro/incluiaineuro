// components/ChecklistUploadModal.tsx
// Wizard de upload e leitura inteligente de checklist preenchido em papel/PDF
// Fluxo: Upload → Analisando → Revisão → Salvar no dossiê

import React, { useState, useRef, useCallback } from 'react';
import {
  X, Upload, FileText, AlertCircle, Sparkles, RefreshCw,
  ChevronDown, ChevronUp, AlertTriangle, Save, ShieldCheck, ScanLine,
} from 'lucide-react';
import { Student, User } from '../types';
import { callAIGateway } from '../services/aiGatewayService';
import { cleanJsonString, friendlyAIError } from '../services/aiService';
import { scanChecklistSheet, type ScanRawResult } from '../services/checklistScanService';
import { ChecklistScanReviewModal } from './ChecklistScanReviewModal';
import { StorageService } from '../services/storageService';
import {
  ObservationFormService,
  StudentDocumentService,
  TimelineService,
} from '../services/persistenceService';
import { generateDocumentCode } from '../utils/documentCodes';
import { AI_CREDIT_COSTS } from '../config/aiCosts';
import { DEMO_MODE } from '../services/supabase';
import {
  SECTIONS as REGENTE_SECTIONS,
  CONTEXTO_OPTIONS,
} from './ChecklistRegenteForm';
import { SECTIONS as CUIDADORA_SECTIONS } from './ChecklistCuidadoraForm';

// ── Tipos ──────────────────────────────────────────────────────────────────────

type ChecklistType = 'checklist_regente' | 'checklist_cuidadora';
type Step = 'upload' | 'analyzing' | 'review';

interface AnalysisResult {
  checklistType: ChecklistType;
  detectedStudentName: string | null;
  date: string | null;
  extraFields: Record<string, string>;
  sections: Record<string, string[]>;
  freeNotes: string;
  confidence: number;
  uncertainFields: string[];
}

interface ReviewState {
  header: Record<string, string>;
  sections: Record<string, string[]>;
  observacoesLivres: string;
}

export interface ChecklistUploadModalProps {
  students: Student[];
  user: User;
  defaultStudentId?: string;
  defaultChecklistType?: ChecklistType;
  onClose: () => void;
  onSaved: () => void;
}

// ── Constantes ─────────────────────────────────────────────────────────────────

const MAX_FILE_SIZE_MB = 10;
const ACCEPTED_TYPES = '.pdf,.jpg,.jpeg,.png,.webp';
const ACCEPTED_MIMES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Erro ao ler o arquivo.'));
    reader.readAsDataURL(file);
  });
}

function buildOCRPrompt(type: ChecklistType): string {
  if (type === 'checklist_regente') {
    return `Você é um sistema especializado em leitura de documentos educacionais.
Analise esta imagem ou PDF de um checklist preenchido em papel e identifique quais itens estão marcados.

TIPO: Checklist de Observação em Sala — Professor Regente (IncluiAI)

SEÇÕES E ITENS DISPONÍVEIS (use EXATAMENTE estes textos):

contextoObservado: ["Aula expositiva","Atividade individual","Atividade em grupo","Recreio","Entrada/saída","Avaliação","Atendimento individual","Outro"]

atencaoParticipacao: ["Mantém atenção por curto período","Mantém atenção com mediação","Distrai-se facilmente","Participa espontaneamente","Participa quando chamado","Evita participação","Necessita de comandos repetidos","Finaliza atividades","Abandona atividades antes de concluir"]

comunicacao: ["Comunica necessidades verbalmente","Usa gestos/apontar","Usa frases curtas","Tem dificuldade para pedir ajuda","Responde comandos simples","Demonstra compreensão parcial","Necessita de apoio visual","Apresenta ecolalia/repetições","Não se comunica espontaneamente"]

interacaoSocial: ["Interage com colegas","Prefere ficar sozinho","Busca adultos","Aceita ajuda","Compartilha materiais","Tem conflitos frequentes","Demonstra frustração","Segue combinados sociais com apoio","Participa de atividades coletivas"]

autonomia: ["Organiza materiais","Precisa de ajuda para iniciar","Precisa de ajuda para concluir","Pede ajuda quando necessário","Usa banheiro com autonomia","Alimenta-se com autonomia","Desloca-se com segurança","Necessita de supervisão constante"]

aprendizagem: ["Reconhece letras/números","Lê palavras/frases","Copia do quadro","Registra respostas","Compreende instruções","Resolve atividades simples","Necessita de adaptação","Necessita de material concreto","Demonstra conhecimento prévio"]

regulacaoComportamento: ["Mantém-se tranquilo","Apresenta agitação motora","Demonstra ansiedade","Apresenta irritabilidade","Chora com facilidade","Apresenta recusa","Necessita de pausa","Regula-se com apoio","Reage bem a rotina visual"]

estrategiasEficazes: ["Comando curto","Suporte visual","Material concreto","Reforço positivo","Pausa programada","Redução de estímulos","Tempo ampliado","Atividade em etapas","Mediação individual"]

recomendacoesImediatas: ["Manter rotina visual","Adaptar atividade","Reduzir quantidade de itens","Oferecer apoio individual","Usar material concreto","Registrar nova observação","Conversar com família","Encaminhar para AEE","Solicitar estudo de caso"]

INSTRUÇÕES:
1. Identifique quais itens têm marcação visível (✓, ■, X, círculo preenchido, etc.).
2. Use EXATAMENTE os textos listados acima. Mapeie o texto mais próximo do impresso.
3. Não inclua itens sem marcação.
4. Transcreva texto manuscrito nas "freeNotes".
5. Identifique nome do aluno, professor, série e data se visíveis.
6. Liste em "uncertainFields" itens com baixa legibilidade.
7. "confidence": número de 0 a 1 com base na qualidade geral da leitura.

RETORNE APENAS JSON válido (sem markdown, sem comentários adicionais):
{
  "checklistType": "checklist_regente",
  "detectedStudentName": null,
  "date": null,
  "extraFields": { "professor": "", "serie": "" },
  "sections": {
    "contextoObservado": [],
    "atencaoParticipacao": [],
    "comunicacao": [],
    "interacaoSocial": [],
    "autonomia": [],
    "aprendizagem": [],
    "regulacaoComportamento": [],
    "estrategiasEficazes": [],
    "recomendacoesImediatas": []
  },
  "freeNotes": "",
  "confidence": 0.8,
  "uncertainFields": []
}`;
  }

  return `Você é um sistema especializado em leitura de documentos educacionais.
Analise esta imagem ou PDF de um checklist preenchido em papel e identifique quais itens estão marcados.

TIPO: Análise de Rotina Semanal — Cuidadora (IncluiAI)

SEÇÕES E ITENS DISPONÍVEIS (use EXATAMENTE estes textos):

chegadaEscola: ["Chegou tranquilo","Chegou choroso","Chegou agitado","Resistiu à entrada","Precisou de acolhimento individual","Separou-se bem da família","Demonstrou cansaço","Trouxe objeto de conforto"]

alimentacao: ["Alimentou-se com autonomia","Precisou de ajuda","Recusou alimentação","Apresentou seletividade alimentar","Aceitou novos alimentos","Bebeu água com lembrete","Apresentou desconforto","Necessitou supervisão constante"]

higieneBanheiro: ["Usa banheiro com autonomia","Solicita ir ao banheiro","Precisa ser lembrado","Precisa de ajuda parcial","Precisa de ajuda total","Teve escape","Resistiu à higiene","Aceitou rotina de higiene"]

deslocamentoSeguranca: ["Desloca-se com autonomia","Precisa de acompanhamento","Corre sem aviso","Afasta-se do grupo","Segue combinados com apoio","Necessita supervisão em espaços abertos","Apresenta risco em escadas/corredores","Responde ao chamado do adulto"]

comunicacaoNecessidades: ["Pede ajuda verbalmente","Usa gestos/apontar","Chora para comunicar","Leva adulto até o objeto/local","Usa palavras/frases curtas","Não comunica necessidade","Usa comunicação alternativa","Demonstra desconforto por comportamento"]

regulacaoEmocional: ["Manteve-se regulado","Teve irritabilidade","Apresentou choro","Apresentou gritos","Apresentou fuga/esquiva","Teve crise","Precisou de pausa","Regulou-se com apoio","Regulou-se com objeto/estratégia específica"]

interacaoSocial: ["Busca colegas","Prefere ficar sozinho","Aceita aproximação","Rejeita aproximação","Compartilha materiais com apoio","Imita colegas","Busca adulto com frequência","Participa de brincadeiras"]

transicoesRotina: ["Aceita troca de atividade","Resiste a mudanças","Precisa de aviso prévio","Melhora com rotina visual","Apresenta crise em transições","Aceita encerramento da atividade","Precisa de tempo extra","Segue combinados com apoio"]

estrategiasEficazes: ["Rotina visual","Antecipação verbal","Comando curto","Objeto de conforto","Pausa sensorial","Reforço positivo","Música","Redução de estímulos","Espaço tranquilo","Mediação individual"]

alertasSemana: ["Mudança de comportamento","Sonolência excessiva","Agitação incomum","Recusa alimentar","Crise recorrente","Dificuldade de separação da família","Sensibilidade sensorial acentuada","Necessidade de comunicar família/equipe"]

INSTRUÇÕES:
1. Identifique quais itens têm marcação visível (✓, ■, X, círculo preenchido, etc.).
2. Use EXATAMENTE os textos listados acima.
3. Não inclua itens sem marcação.
4. Transcreva observações manuscritas nas "freeNotes".
5. Identifique nome do aluno, cuidadora, turno e semana de referência se visíveis.
6. Liste em "uncertainFields" itens com baixa legibilidade.
7. "confidence": número de 0 a 1.

RETORNE APENAS JSON válido (sem markdown, sem comentários adicionais):
{
  "checklistType": "checklist_cuidadora",
  "detectedStudentName": null,
  "date": null,
  "extraFields": { "cuidadora": "", "turno": "", "semanaReferencia": "" },
  "sections": {
    "chegadaEscola": [],
    "alimentacao": [],
    "higieneBanheiro": [],
    "deslocamentoSeguranca": [],
    "comunicacaoNecessidades": [],
    "regulacaoEmocional": [],
    "interacaoSocial": [],
    "transicoesRotina": [],
    "estrategiasEficazes": [],
    "alertasSemana": []
  },
  "freeNotes": "",
  "confidence": 0.8,
  "uncertainFields": []
}`;
}

function buildReviewState(analysis: AnalysisResult, type: ChecklistType): ReviewState {
  const secs = analysis.sections ?? {};
  const extra = analysis.extraFields ?? {};
  const today = new Date().toISOString().split('T')[0];

  if (type === 'checklist_regente') {
    return {
      header: {
        professor:       extra.professor || '',
        serie:           extra.serie || '',
        dataObservacao:  analysis.date || today,
      },
      sections: {
        contextoObservado:       secs.contextoObservado       ?? [],
        atencaoParticipacao:     secs.atencaoParticipacao     ?? [],
        comunicacao:             secs.comunicacao             ?? [],
        interacaoSocial:         secs.interacaoSocial         ?? [],
        autonomia:               secs.autonomia               ?? [],
        aprendizagem:            secs.aprendizagem            ?? [],
        regulacaoComportamento:  secs.regulacaoComportamento  ?? [],
        estrategiasEficazes:     secs.estrategiasEficazes     ?? [],
        recomendacoesImediatas:  secs.recomendacoesImediatas  ?? [],
      },
      observacoesLivres: analysis.freeNotes || '',
    };
  }

  return {
    header: {
      cuidadora:        extra.cuidadora        || '',
      turno:            extra.turno            || '',
      semanaReferencia: extra.semanaReferencia  || '',
      dataPreenchimento: analysis.date         || today,
    },
    sections: {
      chegadaEscola:         secs.chegadaEscola         ?? [],
      alimentacao:           secs.alimentacao           ?? [],
      higieneBanheiro:       secs.higieneBanheiro       ?? [],
      deslocamentoSeguranca: secs.deslocamentoSeguranca ?? [],
      comunicacaoNecessidades: secs.comunicacaoNecessidades ?? [],
      regulacaoEmocional:    secs.regulacaoEmocional    ?? [],
      interacaoSocial:       secs.interacaoSocial       ?? [],
      transicoesRotina:      secs.transicoesRotina      ?? [],
      estrategiasEficazes:   secs.estrategiasEficazes   ?? [],
      alertasSemana:         secs.alertasSemana         ?? [],
    },
    observacoesLivres: analysis.freeNotes || '',
  };
}

// ── Componente ─────────────────────────────────────────────────────────────────

export const ChecklistUploadModal: React.FC<ChecklistUploadModalProps> = ({
  students,
  user,
  defaultStudentId,
  defaultChecklistType,
  onClose,
  onSaved,
}) => {
  const [step, setStep] = useState<Step>('upload');
  const [selectedStudentId, setSelectedStudentId] = useState(
    defaultStudentId ?? students[0]?.id ?? '',
  );
  const [checklistType, setChecklistType] = useState<ChecklistType>(
    defaultChecklistType ?? 'checklist_regente',
  );
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [reviewState, setReviewState] = useState<ReviewState | null>(null);
  const [openSections, setOpenSections] = useState<Set<string>>(new Set());
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ENEM-like format — usa scan service com códigos
  const [isEnemFormat, setIsEnemFormat] = useState(false);
  const [enemScan, setEnemScan] = useState<ScanRawResult | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectedStudent = students.find(s => s.id === selectedStudentId);
  const currentSections =
    checklistType === 'checklist_regente' ? REGENTE_SECTIONS : CUIDADORA_SECTIONS;

  // ── Arquivo ─────────────────────────────────────────────────────────────────

  const validateAndSetFile = (f: File) => {
    setError(null);
    if (!ACCEPTED_MIMES.includes(f.type)) {
      setError('Tipo não aceito. Use PDF, JPG, PNG ou WEBP.');
      return;
    }
    if (f.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      setError(`Arquivo muito grande. Máximo ${MAX_FILE_SIZE_MB} MB.`);
      return;
    }
    setFile(f);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) validateAndSetFile(f);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Análise IA ───────────────────────────────────────────────────────────────

  const handleAnalyze = async () => {
    if (!file || !selectedStudentId) return;
    setStep('analyzing');
    setError(null);

    // Fluxo ENEM-like: usa scan service com códigos padronizados
    if (isEnemFormat) {
      if (DEMO_MODE) {
        await new Promise(r => setTimeout(r, 1400));
        const mockCodes = checklistType === 'checklist_regente'
          ? ['A1', 'A3', 'C2', 'C7', 'E2', 'E4']
          : ['CH1', 'AL2', 'RE7', 'RE8', 'AW7'];
        setEnemScan({
          checklistType,
          schemaVersion: 'enem_v1',
          studentCode: selectedStudentId.substring(0, 8).toUpperCase(),
          markedCodes: mockCodes,
          uncertainCodes: checklistType === 'checklist_regente' ? ['S4'] : [],
          extraFields: checklistType === 'checklist_regente'
            ? { professor: 'Demo Professor', serie: '3º ano EF', dataObservacao: new Date().toISOString().split('T')[0] }
            : { cuidadora: 'Demo Cuidadora', turno: 'Manhã', semanaReferencia: '12/05 a 16/05', dataPreenchimento: new Date().toISOString().split('T')[0] },
          freeNotes: 'Observação demo — aluno demonstrou boa receptividade.',
          overallConfidence: 0.88,
        });
        setStep('upload');
        return;
      }
      try {
        const base64 = await fileToBase64(file);
        const result = await scanChecklistSheet(base64, checklistType, selectedStudentId);
        setEnemScan(result.raw);
        setStep('upload');
      } catch (e) {
        setError(friendlyAIError(e));
        setStep('upload');
      }
      return;
    }

    if (DEMO_MODE) {
      await new Promise(r => setTimeout(r, 1400));
      const mock: AnalysisResult = {
        checklistType,
        detectedStudentName: selectedStudent?.name ?? null,
        date: new Date().toISOString().split('T')[0],
        extraFields:
          checklistType === 'checklist_regente'
            ? { professor: 'Demo Professor', serie: '3º ano EF' }
            : { cuidadora: 'Demo Cuidadora', turno: 'Manhã', semanaReferencia: '12/05 a 16/05' },
        sections:
          checklistType === 'checklist_regente'
            ? {
                atencaoParticipacao: ['Distrai-se facilmente', 'Necessita de comandos repetidos'],
                comunicacao: ['Usa frases curtas', 'Necessita de apoio visual'],
                estrategiasEficazes: ['Suporte visual', 'Reforço positivo'],
              }
            : {
                chegadaEscola: ['Chegou tranquilo'],
                regulacaoEmocional: ['Precisou de pausa', 'Regulou-se com apoio'],
                alertasSemana: ['Sensibilidade sensorial acentuada'],
              },
        freeNotes: 'Aluno apresentou boa receptividade no início da aula.',
        confidence: 0.85,
        uncertainFields: checklistType === 'checklist_regente'
          ? ['Seção 3 — item autonomia (difícil leitura)']
          : [],
      };
      setAnalysis(mock);
      const rs = buildReviewState(mock, checklistType);
      setReviewState(rs);
      setOpenSections(
        new Set(Object.keys(rs.sections).filter(k => (rs.sections[k]?.length ?? 0) > 0)),
      );
      setStep('review');
      return;
    }

    try {
      const base64 = await fileToBase64(file);
      const { result } = await callAIGateway({
        task:            'document',
        prompt:          buildOCRPrompt(checklistType),
        imageBase64:     base64,
        creditsRequired: AI_CREDIT_COSTS.ANALISE_DOCUMENTO,
        requestType:     'checklist_ocr',
        studentId:       selectedStudentId,
      });

      const parsed = JSON.parse(cleanJsonString(result)) as AnalysisResult;
      const rs = buildReviewState(parsed, checklistType);

      setAnalysis(parsed);
      setReviewState(rs);
      setOpenSections(
        new Set(Object.keys(rs.sections).filter(k => (rs.sections[k]?.length ?? 0) > 0)),
      );
      setStep('review');
    } catch (e) {
      setError(friendlyAIError(e));
      setStep('upload');
    }
  };

  // ── Toggle item ──────────────────────────────────────────────────────────────

  const toggleItem = (sectionId: string, item: string) => {
    setReviewState(prev => {
      if (!prev) return prev;
      const curr = prev.sections[sectionId] ?? [];
      return {
        ...prev,
        sections: {
          ...prev.sections,
          [sectionId]: curr.includes(item)
            ? curr.filter(x => x !== item)
            : [...curr, item],
        },
      };
    });
  };

  const setHeader = (key: string, value: string) => {
    setReviewState(prev =>
      prev ? { ...prev, header: { ...prev.header, [key]: value } } : prev,
    );
  };

  const toggleSection = (id: string) => {
    setOpenSections(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ── Salvar ───────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!reviewState || !selectedStudentId || !file || !user.tenant_id) return;
    setIsSaving(true);
    setError(null);

    try {
      // 1. Upload do arquivo original
      const ext = (file.name.split('.').pop() ?? 'pdf').toLowerCase();
      const storagePath = `${user.tenant_id}/checklists/${crypto.randomUUID()}.${ext}`;
      const uploadedPath = await StorageService.uploadFile(file, 'documentos_pdf', storagePath);
      let fileUrl: string | null = null;
      if (uploadedPath) {
        // 30 dias de validade para a URL assinada
        fileUrl = await StorageService.getSignedUrl('documentos_pdf', uploadedPath, 60 * 60 * 24 * 30);
      }

      // 2. Montar fields_data compatível com os checklists digitais
      const auditCode = generateDocumentCode('registration');
      const fieldsData: Record<string, unknown> = {
        ...reviewState.header,
        ...reviewState.sections,
        observacoesLivres:  reviewState.observacoesLivres,
        origin:             'uploaded_ai_read',
        confidence:         analysis?.confidence ?? null,
        originalFileUrl:    fileUrl,
        originalFilePath:   uploadedPath,
        originalFileName:   file.name,
        auditCode,
        savedAt:            new Date().toISOString(),
      };

      const title =
        checklistType === 'checklist_regente'
          ? 'Checklist de Observação em Sala (via upload)'
          : 'Análise de Rotina Semanal — Cuidadora (via upload)';

      // 3. Salvar observation_form
      const formId = await ObservationFormService.save({
        tenantId:      user.tenant_id,
        studentId:     selectedStudentId,
        userId:        user.id,
        formType:      checklistType,
        title,
        fieldsData:    fieldsData as Record<string, any>,
        auditCode,
        createdBy:     user.name,
        status:        'finalizado',
        origin:        'uploaded_ai_read',
        confidence:    analysis?.confidence ?? null,
        sourceFileUrl: fileUrl,
      });

      if (formId) {
        // 4. Registrar arquivo em student_documents
        await StudentDocumentService.save({
          tenantId:     user.tenant_id,
          studentId:    selectedStudentId,
          name:         `${title} — ${file.name}`,
          documentType: 'Outro',
          fileUrl:      fileUrl ?? undefined,
          filePath:     uploadedPath ?? undefined,
          fileSize:     file.size,
          mimeType:     file.type,
          uploadedBy:   user.name,
          notes:        `Leitura IA · Confiança: ${Math.round((analysis?.confidence ?? 0) * 100)}% · Código: ${auditCode}`,
        });

        // 5. Timeline
        await TimelineService.add({
          tenantId:    user.tenant_id,
          studentId:   selectedStudentId,
          eventType:   'ficha',
          title:       `${title} registrado`,
          description: `Upload com leitura IA — Código: ${auditCode} — por ${user.name}`,
          linkedId:    formId,
          linkedTable: 'observation_forms',
          icon:        'ClipboardCheck',
          author:      user.name,
        });
      }

      onSaved();
    } catch (e: any) {
      setError(`Erro ao salvar: ${e?.message ?? 'Tente novamente.'}`);
    } finally {
      setIsSaving(false);
    }
  };

  // ── Render: Upload ───────────────────────────────────────────────────────────

  const renderUpload = () => (
    <div className="flex flex-col gap-5">
      {/* Aluno */}
      <div>
        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">
          Aluno
        </label>
        <select
          className="w-full border border-gray-200 rounded-xl p-2.5 text-sm outline-none focus:ring-2 focus:ring-[#1F4E5F]/30 bg-white"
          value={selectedStudentId}
          onChange={e => setSelectedStudentId(e.target.value)}
        >
          <option value="">Selecione um aluno...</option>
          {students.map(s => (
            <option key={s.id} value={s.id}>
              {s.name}{s.grade ? ` — ${s.grade}` : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Tipo */}
      <div>
        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
          Tipo de Checklist
        </label>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ['checklist_regente', '📝 Professor Regente'],
              ['checklist_cuidadora', '🧡 Cuidadora'],
            ] as [ChecklistType, string][]
          ).map(([type, label]) => (
            <button
              key={type}
              type="button"
              onClick={() => setChecklistType(type)}
              className={`py-3 px-4 rounded-xl text-sm font-bold border-2 transition ${
                checklistType === type
                  ? 'text-white border-[#1F4E5F]'
                  : 'border-gray-200 text-gray-600 bg-white hover:border-[#1F4E5F]/40'
              }`}
              style={checklistType === type ? { background: '#1F4E5F' } : {}}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Formato do checklist */}
      <div>
        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
          Formato do checklist
        </label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setIsEnemFormat(false)}
            className={`py-2.5 px-3 rounded-xl text-xs font-bold border-2 transition ${
              !isEnemFormat
                ? 'text-white border-[#1F4E5F]'
                : 'border-gray-200 text-gray-600 bg-white hover:border-[#1F4E5F]/40'
            }`}
            style={!isEnemFormat ? { background: '#1F4E5F' } : {}}
          >
            Comum (foto livre)
          </button>
          <button
            type="button"
            onClick={() => setIsEnemFormat(true)}
            className={`flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-xs font-bold border-2 transition ${
              isEnemFormat
                ? 'text-white border-[#C69214]'
                : 'border-gray-200 text-gray-600 bg-white hover:border-[#C69214]/40'
            }`}
            style={isEnemFormat ? { background: '#C69214' } : {}}
          >
            <ScanLine size={13} /> Leitura automática IncluiAI
          </button>
        </div>
        {isEnemFormat && (
          <p className="text-xs text-amber-700 mt-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 leading-relaxed">
            Use apenas com o checklist gerado pelo IncluiAI (botão "Checklist p/ leitura automática").
            A IA identificará as marcações pelos códigos impressos (A1, C3, RE2...).
          </p>
        )}
      </div>

      {/* Dropzone */}
      <div>
        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
          Arquivo do Checklist
        </label>
        <div
          className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition ${
            isDragging
              ? 'border-[#1F4E5F] bg-blue-50'
              : 'border-gray-200 hover:border-[#1F4E5F]/50 bg-gray-50'
          }`}
          onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_TYPES}
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) validateAndSetFile(f);
            }}
          />
          {file ? (
            <div className="flex flex-col items-center gap-2">
              <FileText size={32} className="text-[#1F4E5F]" />
              <p className="font-bold text-sm text-gray-800">{file.name}</p>
              <p className="text-xs text-gray-400">
                {(file.size / 1024 / 1024).toFixed(2)} MB · Clique para trocar
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <Upload size={32} className="text-gray-300" />
              <div>
                <p className="font-bold text-sm text-gray-700">
                  Arraste ou clique para selecionar
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  PDF, JPG, PNG ou WEBP · Máximo 10 MB · Até 3 páginas
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Aviso */}
      <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-amber-50 border border-amber-200">
        <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-800 leading-relaxed">
          <strong>Revisão obrigatória:</strong> A leitura automática pode conter erros.
          Revise todas as informações antes de salvar no dossiê do aluno.
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200">
          <AlertCircle size={14} className="text-red-500 shrink-0 mt-0.5" />
          <p className="text-xs text-red-700">{error}</p>
        </div>
      )}

      {/* Ações */}
      <div className="flex gap-3">
        <button
          onClick={onClose}
          className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-bold text-gray-600 hover:bg-gray-50 transition"
        >
          Cancelar
        </button>
        <button
          onClick={handleAnalyze}
          disabled={!file || !selectedStudentId}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-white transition disabled:opacity-40"
          style={{ background: '#1F4E5F' }}
        >
          <Sparkles size={14} />
          Analisar com IA
          <span className="text-[10px] opacity-70 ml-1">
            {AI_CREDIT_COSTS.ANALISE_DOCUMENTO} créditos
          </span>
        </button>
      </div>
    </div>
  );

  // ── Render: Analisando ───────────────────────────────────────────────────────

  const renderAnalyzing = () => (
    <div className="flex flex-col items-center justify-center py-16 gap-5">
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center"
        style={{ background: '#EFF6FF' }}
      >
        <RefreshCw size={28} className="animate-spin" style={{ color: '#1F4E5F' }} />
      </div>
      <div className="text-center">
        <p className="font-bold text-gray-800">Analisando checklist com IA...</p>
        <p className="text-xs text-gray-400 mt-1">Isso pode levar alguns segundos</p>
      </div>
      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-4 py-2.5 max-w-xs text-center">
        A IA está identificando as marcações e observações do documento
      </p>
    </div>
  );

  // ── Render: Revisão ──────────────────────────────────────────────────────────

  const renderReview = () => {
    if (!reviewState || !analysis) return null;

    const pct = Math.round((analysis.confidence ?? 0) * 100);
    const confOk = pct >= 80;
    const confWarn = pct >= 60 && pct < 80;
    const confColor = confOk ? '#16A34A' : confWarn ? '#D97706' : '#DC2626';
    const confBg    = confOk ? '#DCFCE7' : confWarn ? '#FEF9C3' : '#FEE2E2';
    const isRegente = checklistType === 'checklist_regente';

    return (
      <div className="flex flex-col gap-4">
        {/* Badge de confiança */}
        <div className="flex items-center gap-3 p-3.5 rounded-xl bg-white border border-[#E7E2D8]">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: confBg }}
          >
            <ShieldCheck size={18} style={{ color: confColor }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-gray-800">
              Confiança da leitura: {pct}%
            </p>
            {analysis.detectedStudentName && (
              <p className="text-xs text-gray-500 mt-0.5">
                Aluno detectado:{' '}
                <strong>{analysis.detectedStudentName}</strong>
              </p>
            )}
          </div>
          {analysis.uncertainFields.length > 0 && (
            <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-1 rounded-full shrink-0">
              {analysis.uncertainFields.length} incerto(s)
            </span>
          )}
        </div>

        {/* Aviso */}
        <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50 border border-amber-200">
          <AlertTriangle size={14} className="text-amber-600 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800">
            <strong>Dados detectados pela IA.</strong> Revise e corrija antes de salvar.
            Nenhum dado é salvo sem sua confirmação.
          </p>
        </div>

        {/* Campos de cabeçalho */}
        <div className="rounded-xl border border-[#E7E2D8] bg-white p-4 space-y-3">
          <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wide">
            Dados do cabeçalho
          </h4>
          {isRegente ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Professor(a) regente</label>
                <input
                  className="w-full border border-gray-200 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-[#1F4E5F]/30"
                  value={reviewState.header.professor ?? ''}
                  onChange={e => setHeader('professor', e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Série / Ano</label>
                <input
                  className="w-full border border-gray-200 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-[#1F4E5F]/30"
                  value={reviewState.header.serie ?? ''}
                  onChange={e => setHeader('serie', e.target.value)}
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-gray-500 mb-1">Data da observação</label>
                <input
                  type="date"
                  className="w-full border border-gray-200 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-[#1F4E5F]/30"
                  value={reviewState.header.dataObservacao ?? ''}
                  onChange={e => setHeader('dataObservacao', e.target.value)}
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-xs text-gray-500 mb-1">Cuidadora / Apoio</label>
                <input
                  className="w-full border border-gray-200 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-[#1F4E5F]/30"
                  value={reviewState.header.cuidadora ?? ''}
                  onChange={e => setHeader('cuidadora', e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Turno</label>
                <select
                  className="w-full border border-gray-200 rounded-lg p-2 text-sm outline-none bg-white focus:ring-2 focus:ring-[#1F4E5F]/30"
                  value={reviewState.header.turno ?? ''}
                  onChange={e => setHeader('turno', e.target.value)}
                >
                  <option value="">Selecione</option>
                  {['Manhã', 'Tarde', 'Integral'].map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Semana de referência</label>
                <input
                  className="w-full border border-gray-200 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-[#1F4E5F]/30"
                  placeholder="Ex: 12/05 a 16/05"
                  value={reviewState.header.semanaReferencia ?? ''}
                  onChange={e => setHeader('semanaReferencia', e.target.value)}
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-gray-500 mb-1">Data de preenchimento</label>
                <input
                  type="date"
                  className="w-full border border-gray-200 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-[#1F4E5F]/30"
                  value={reviewState.header.dataPreenchimento ?? ''}
                  onChange={e => setHeader('dataPreenchimento', e.target.value)}
                />
              </div>
            </div>
          )}
        </div>

        {/* Contexto observado — apenas regente */}
        {isRegente && (
          <div className="rounded-xl border border-[#E7E2D8] bg-white p-4 space-y-2">
            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wide">
              Contexto observado
            </h4>
            <div className="flex flex-wrap gap-2">
              {CONTEXTO_OPTIONS.map(opt => {
                const active = (reviewState.sections.contextoObservado ?? []).includes(opt);
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => toggleItem('contextoObservado', opt)}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold border transition ${
                      active
                        ? 'text-white border-[#1F4E5F]'
                        : 'bg-white border-gray-200 text-gray-600 hover:border-[#1F4E5F]/40'
                    }`}
                    style={active ? { background: '#1F4E5F' } : {}}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Seções do checklist */}
        <div className="space-y-1.5">
          {currentSections.map(sec => {
            const sectionId = sec.id as string;
            const selected = reviewState.sections[sectionId] ?? [];
            const isOpen   = openSections.has(sectionId);
            const isAlert  = sectionId === 'alertasSemana';
            const hasUncertain = analysis.uncertainFields.some(u =>
              u.toLowerCase().includes(sec.label.toLowerCase().slice(0, 12)),
            );

            return (
              <div
                key={sectionId}
                className="rounded-xl border overflow-hidden"
                style={{
                  borderColor: isAlert && selected.length > 0 ? '#FCA5A5' : '#E5E7EB',
                  background: '#fff',
                }}
              >
                <button
                  type="button"
                  className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition"
                  onClick={() => toggleSection(sectionId)}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-base">{sec.emoji}</span>
                    <span
                      className={`text-sm font-bold ${
                        isAlert ? 'text-red-700' : 'text-gray-700'
                      }`}
                    >
                      {sec.label}
                    </span>
                    {selected.length > 0 && (
                      <span
                        className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white"
                        style={{ background: isAlert ? '#DC2626' : '#1F4E5F' }}
                      >
                        {selected.length}
                      </span>
                    )}
                    {hasUncertain && (
                      <span title="Seção com baixa confiança de leitura">
                        <AlertTriangle size={12} className="text-amber-500" />
                      </span>
                    )}
                  </div>
                  {isOpen
                    ? <ChevronUp size={15} className="text-gray-400" />
                    : <ChevronDown size={15} className="text-gray-400" />}
                </button>

                {isOpen && (
                  <div className="px-4 pb-4 pt-1 border-t border-gray-100">
                    <div className="grid sm:grid-cols-2 gap-1.5 mt-2">
                      {(sec.items as string[]).map(item => {
                        const checked = selected.includes(item);
                        const uncertain = analysis.uncertainFields.some(u =>
                          u.toLowerCase().includes(item.toLowerCase().slice(0, 12)),
                        );
                        return (
                          <label
                            key={item}
                            className={`flex items-start gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition border ${
                              checked
                                ? isAlert
                                  ? 'bg-red-50 border-red-300 text-red-800'
                                  : 'bg-[#EFF6FF] border-[#1F4E5F]/30 text-[#1F4E5F]'
                                : 'bg-gray-50 border-gray-100 text-gray-700 hover:bg-gray-100'
                            }`}
                          >
                            <input
                              type="checkbox"
                              className="mt-0.5 shrink-0"
                              style={{ accentColor: isAlert ? '#DC2626' : '#1F4E5F' }}
                              checked={checked}
                              onChange={() => toggleItem(sectionId, item)}
                            />
                            <span className="text-xs leading-snug flex-1">{item}</span>
                            {uncertain && (
                              <span title="Baixa confiança de leitura">
                                <AlertTriangle size={11} className="text-amber-400 shrink-0 mt-0.5" />
                              </span>
                            )}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Observações livres */}
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
            Observações livres (transcrição)
          </label>
          <textarea
            className="w-full border border-gray-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-[#1F4E5F]/30 outline-none bg-white resize-none"
            rows={4}
            placeholder="Observações manuscritas transcritas pela IA..."
            value={reviewState.observacoesLivres}
            onChange={e =>
              setReviewState(prev =>
                prev ? { ...prev, observacoesLivres: e.target.value } : prev,
              )
            }
          />
        </div>

        {/* Campos incertos */}
        {analysis.uncertainFields.length > 0 && (
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-bold text-amber-700">
              <AlertTriangle size={12} />
              Campos com baixa confiança de leitura:
            </div>
            <ul className="text-xs text-amber-600 pl-4 list-disc space-y-0.5">
              {analysis.uncertainFields.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200">
            <AlertCircle size={14} className="text-red-500 shrink-0 mt-0.5" />
            <p className="text-xs text-red-700">{error}</p>
          </div>
        )}

        {/* Ações fixas no bottom */}
        <div className="flex gap-2 pt-1 sticky bottom-0 bg-white/95 backdrop-blur-sm pb-1">
          <button
            onClick={onClose}
            className="py-2.5 px-4 rounded-xl border border-gray-200 text-sm font-bold text-gray-600 hover:bg-gray-50 transition"
          >
            Cancelar
          </button>
          <button
            onClick={() => {
              setStep('upload');
              setAnalysis(null);
              setReviewState(null);
            }}
            className="py-2.5 px-4 rounded-xl border border-[#1F4E5F]/30 text-sm font-bold text-[#1F4E5F] hover:bg-[#EFF6FF] transition"
          >
            Corrigir arquivo
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || !selectedStudentId}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-white transition disabled:opacity-50"
            style={{ background: '#1F4E5F' }}
          >
            {isSaving ? (
              <><RefreshCw size={14} className="animate-spin" /> Salvando...</>
            ) : (
              <><Save size={14} /> Salvar no dossiê</>
            )}
          </button>
        </div>
      </div>
    );
  };

  // ── Render principal ─────────────────────────────────────────────────────────

  return (
    <>
      {/* Modal de revisão ENEM-like — abre em z-60 acima do modal principal */}
      {enemScan && file && selectedStudent && (
        <ChecklistScanReviewModal
          scan={enemScan}
          file={file}
          student={selectedStudent}
          user={user}
          onClose={() => { setEnemScan(null); setStep('upload'); }}
          onSaved={() => { setEnemScan(null); onSaved(); }}
        />
      )}

    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.55)' }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between p-5 border-b border-[#E7E2D8] shrink-0">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: '#EFF6FF' }}
            >
              <Upload size={18} style={{ color: '#1F4E5F' }} />
            </div>
            <div>
              <h2 className="font-bold text-base text-gray-900">
                Ler checklist preenchido
              </h2>
              <p className="text-xs text-gray-500">
                {step === 'upload'    && 'Suba uma foto ou scan do checklist preenchido em papel'}
                {step === 'analyzing' && 'A IA está lendo o documento...'}
                {step === 'review'    && 'Revise e confirme antes de salvar no dossiê'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-xl transition"
          >
            <X size={18} className="text-gray-500" />
          </button>
        </div>

        {/* Corpo */}
        <div className="flex-1 overflow-y-auto p-5">
          {step === 'upload'    && renderUpload()}
          {step === 'analyzing' && renderAnalyzing()}
          {step === 'review'    && renderReview()}
        </div>
      </div>
    </div>
    </>
  );
};
