/**
 * StudentImportModal.tsx
 * Modal de importação de alunos — dois modos:
 *   CSV:  upload → preview → importing → done
 *   DOCX: upload → ai_processing → ai_preview → done
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  Upload, Download, X, CheckCircle, AlertCircle, AlertTriangle,
  FileText, Eye, EyeOff, Sparkles, Users, ArrowRight, Loader2,
  FileUp, Info, FileSearch, Sheet,
} from 'lucide-react';
import {
  parseCSV,
  downloadTemplate,
  downloadExample,
  importStudentsBatch,
  TEMPLATE_EXAMPLE_ROWS,
  TEMPLATE_HEADERS,
  type ImportStudentRow,
  type ParsedCSVResult,
  type ImportBatchResult,
} from '../services/csvImportService';
import {
  extractTextFromDocx,
  extractTextFromPdf,
  mapDocumentTextToStudentPayload,
  mapVisualDocumentToStudentPayload,
  draftToEditable,
  saveStudentsFromDocx,
  resolveAcceptedImageMimeType,
  buildPageDisclosureMessage,
  DOCUMENT_TRUNCATION_NOTICE,
  CREDITS_DOC_TEXT,
  CREDITS_VISUAL,
  type EditableDraft,
  type DocxSaveResult,
  type ImportFileType,
  type DocumentPageInfo,
} from '../services/studentDocumentImportService';
import { createCreditsSyncGate } from '../utils/creditsSyncGate';
import {
  MAX_VISUAL_PDF_PAGES,
  buildMultiPagePreProcessingNotice,
  buildMultiPageButtonLabel,
  buildMultiPageSuccessMessage,
  buildAnalyzedPagesLabel,
} from '../utils/pdfMultiPage';

// ─── Paleta ────────────────────────────────────────────────────────────────
const C = {
  petrol:    '#1F4E5F',
  dark:      '#2E3A59',
  gold:      '#C69214',
  goldLight: '#FDF6E3',
  bg:        '#F6F4EF',
  surface:   '#FFFFFF',
  border:    '#E7E2D8',
  borderMid: '#C9C3B5',
  text:      '#1F2937',
  textSec:   '#667085',
  red:       '#DC2626',
  redLight:  '#FEF2F2',
  amber:     '#D97706',
  amberLight:'#FFFBEB',
  green:     '#16A34A',
  greenLight:'#F0FDF4',
};

const AI_STAGES = [
  'Lendo o documento',
  'Identificando os dados do aluno',
  'Comparando com os campos do cadastro',
  'Organizando para revisão',
  'Preparando confirmação',
];

// ─── Tipos ────────────────────────────────────────────────────────────────
type ImportMode = 'csv' | 'docx';
type ImportStep = 'upload' | 'preview' | 'importing' | 'done' | 'ai_processing' | 'ai_preview';

export interface ExistingStudentRef {
  id: string;
  name: string;
  birthDate?: string;
}

interface DuplicateCandidate {
  draftIdx: number;
  draftName: string;
  matchName: string;
}

interface Props {
  tenantId: string;
  userId: string;
  onClose: () => void;
  onImportComplete: (importedCount: number) => void;
  /**
   * Chamado UMA VEZ assim que uma análise de IA é confirmada como utilizável
   * (crédito já cobrado pelo Gateway) e a revisão é exibida — o pai deve usar
   * isto para recarregar o saldo exibido (tenantSummary), sem cobrar nada de
   * novo nem chamar a IA de novo. Também serve de rede de segurança ao
   * fechar/cancelar caso ainda não tenha disparado (ver handleClose).
   */
  onCreditsConsumed?: () => void;
  existingStudents?: ExistingStudentRef[];
}

// ─── Helpers de duplicidade ────────────────────────────────────────────────
function normalizeName(s: string): string {
  return s.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ').trim();
}

function findDuplicateCandidates(
  drafts: EditableDraft[],
  existing: ExistingStudentRef[],
): DuplicateCandidate[] {
  const result: DuplicateCandidate[] = [];
  drafts.forEach((draft, idx) => {
    if (!draft.name.trim()) return;
    const dNorm  = normalizeName(draft.name);
    const dWords = dNorm.split(' ').slice(0, 2).join(' ');
    const match  = existing.find(e => {
      const eNorm  = normalizeName(e.name);
      if (dNorm === eNorm) return true;
      const eWords = eNorm.split(' ').slice(0, 2).join(' ');
      return dWords.length > 3 && dWords === eWords;
    });
    if (match) result.push({ draftIdx: idx, draftName: draft.name, matchName: match.name });
  });
  return result;
}

// ─── Helpers visuais ───────────────────────────────────────────────────────
function StatusBadge({ status }: { status: ImportStudentRow['registrationStatus'] }) {
  if (status === 'complete') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold"
          style={{ background: C.greenLight, color: C.green }}>
      <CheckCircle size={10} /> Completo
    </span>
  );
  if (status === 'incomplete') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold"
          style={{ background: C.amberLight, color: C.amber }}>
      <AlertTriangle size={10} /> Incompleto
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold"
          style={{ background: C.redLight, color: C.red }}>
      <AlertCircle size={10} /> Pré-cadastro
    </span>
  );
}

function RowBorderColor(status: ImportStudentRow['registrationStatus']): string {
  if (status === 'complete')   return C.green;
  if (status === 'incomplete') return C.amber;
  return C.red;
}

function SectionHeader({ title }: { title: string }) {
  return (
    <p className="text-xs font-bold uppercase tracking-wide"
       style={{ color: C.petrol, borderBottom: `1px solid ${C.border}`, paddingBottom: 4 }}>
      {title}
    </p>
  );
}

function PreviewCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl p-4 flex flex-col gap-3"
         style={{
           background:  C.surface,
           border:      `1px solid ${C.border}`,
           boxShadow:   '0 1px 4px rgba(0,0,0,0.04)',
         }}>
      {children}
    </div>
  );
}

function Field({
  label, value, onChange, multiline, flagged, hint, type: inputType,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  flagged?: boolean;
  hint?: string;
  type?: string;
}) {
  const borderColor = flagged ? C.amber : C.border;
  const bg          = flagged ? C.amberLight : C.surface;
  return (
    <div>
      <label className="block text-xs font-semibold mb-1" style={{ color: C.dark }}>
        {label}
        {flagged && (
          <span className="ml-1.5 font-normal text-xs" style={{ color: C.amber }}>⚠</span>
        )}
      </label>
      {multiline ? (
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          rows={3}
          placeholder={hint}
          className="w-full rounded-lg px-3 py-2 text-sm outline-none resize-none"
          style={{ border: `1.5px solid ${borderColor}`, background: bg, color: C.text, fontFamily: 'inherit' }}
        />
      ) : (
        <input
          type={inputType ?? 'text'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={hint}
          className="w-full rounded-lg px-3 py-2 text-sm outline-none"
          style={{ border: `1.5px solid ${borderColor}`, background: bg, color: C.text }}
        />
      )}
      {flagged && (
        <p className="text-xs mt-1" style={{ color: C.amber }}>
          Revise este campo antes de salvar
        </p>
      )}
    </div>
  );
}

function GenderSelect({ value, onChange, flagged }: {
  value: string;
  onChange: (v: string) => void;
  flagged?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold mb-1" style={{ color: C.dark }}>
        Gênero
        {flagged && <span className="ml-1.5 font-normal text-xs" style={{ color: C.amber }}>⚠</span>}
      </label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full rounded-lg px-3 py-2 text-sm outline-none"
        style={{
          border: `1.5px solid ${flagged ? C.amber : C.border}`,
          background: flagged ? C.amberLight : C.surface,
          color: value ? C.text : C.textSec,
        }}
      >
        <option value="">Não informado</option>
        <option value="M">Masculino</option>
        <option value="F">Feminino</option>
        <option value="OTHER">Outro</option>
      </select>
      {flagged && (
        <p className="text-xs mt-1" style={{ color: C.amber }}>
          Revise este campo antes de salvar
        </p>
      )}
    </div>
  );
}

function ConfidenceBadge({ confidence }: { confidence: number }) {
  if (confidence >= 0.8) return (
    <div className="flex items-center gap-3 p-3 rounded-xl"
         style={{ background: C.greenLight, border: `1px solid ${C.green}30` }}>
      <CheckCircle size={18} style={{ color: C.green, flexShrink: 0 }} />
      <div>
        <p className="text-sm font-semibold" style={{ color: C.green }}>Alta confiança</p>
        <p className="text-xs mt-0.5" style={{ color: '#15803d' }}>
          Dados organizados com boa precisão. Revise rapidamente e salve.
        </p>
      </div>
    </div>
  );
  if (confidence >= 0.5) return (
    <div className="flex items-center gap-3 p-3 rounded-xl"
         style={{ background: C.amberLight, border: `1px solid ${C.amber}30` }}>
      <AlertTriangle size={18} style={{ color: C.amber, flexShrink: 0 }} />
      <div>
        <p className="text-sm font-semibold" style={{ color: C.amber }}>Confiança média</p>
        <p className="text-xs mt-0.5" style={{ color: '#92400e' }}>
          Revise os campos marcados com ⚠ antes de salvar.
        </p>
      </div>
    </div>
  );
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl"
         style={{ background: C.redLight, border: `1px solid ${C.red}30` }}>
      <AlertCircle size={18} style={{ color: C.red, flexShrink: 0 }} />
      <div>
        <p className="text-sm font-semibold" style={{ color: C.red }}>Revise com atenção</p>
        <p className="text-xs mt-0.5" style={{ color: '#991b1b' }}>
          O documento pode ter informações difíceis de identificar. Confira todos os campos antes de salvar.
        </p>
      </div>
    </div>
  );
}

// ─── Helpers de tipo de arquivo ───────────────────────────────────────────
function getFileTypeLabel(type: ImportFileType | null): string {
  switch (type) {
    case 'docx':      return 'Word (.docx)';
    case 'pdf-text':  return 'PDF com texto';
    case 'pdf-image': return 'PDF escaneado';
    case 'image':     return 'Imagem';
    default:          return 'Documento';
  }
}

const ACCEPTED_DOC_EXTS = ['.docx', '.pdf', '.png', '.jpg', '.jpeg', '.webp'];
const UNSUPPORTED_FORMAT_MESSAGE = 'Este arquivo utiliza um formato não suportado. Envie PDF, Word (.docx), JPG, PNG ou WEBP.';
const LEGACY_DOC_MESSAGE = 'Arquivos Word antigos (.doc) precisam ser convertidos para .docx ou PDF.';

// ─── Componente principal ─────────────────────────────────────────────────
export const StudentImportModal: React.FC<Props> = ({
  tenantId, userId, onClose, onImportComplete, onCreditsConsumed, existingStudents,
}) => {
  // ── Estado CSV ─────────────────────────────────────────────────────────────
  const [step, setStep]             = useState<ImportStep>('upload');
  const [file, setFile]             = useState<File | null>(null);
  const [parsed, setParsed]         = useState<ParsedCSVResult | null>(null);
  const [progress, setProgress]     = useState(0);
  const [result, setResult]         = useState<ImportBatchResult | null>(null);
  const [showExample, setShowExample] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // ── Estado DOCX ────────────────────────────────────────────────────────────
  const [importMode, setImportMode]           = useState<ImportMode>('csv');
  const [docxDrafts, setDocxDrafts]           = useState<EditableDraft[]>([]);
  const [currentDraftIdx, setCurrentDraftIdx] = useState(0);
  const [docxSaveResult, setDocxSaveResult]   = useState<DocxSaveResult | null>(null);
  const [docxIsSaving, setDocxIsSaving]       = useState(false);

  // ── Consumo de créditos (corrigido em 26/08/2026 — "consumo no momento
  // certo"): o AI Gateway confirma (commit) o crédito atomicamente assim que
  // entrega uma resposta utilizável — não há mais reserva para o frontend
  // gerenciar depois (nenhum commit/release local, nenhuma reserva
  // pendurada). `creditsCharged` só existe para mostrar discretamente
  // "Análise concluída — N créditos utilizados" na revisão.
  const [creditsCharged, setCreditsCharged] = useState<number | null>(null);
  // Guarda de duplo clique: sincronamente impede uma 2ª chamada de IA
  // enquanto a 1ª ainda está em voo (setStep é assíncrono — um ref é o único
  // jeito de bloquear ANTES do próximo render).
  const isProcessingRef = useRef(false);
  // Sincronização do saldo exibido (não é estado financeiro — é só "já
  // avisei o pai para recarregar tenantSummary?"). Ref porque não deve
  // disparar re-render nem se comportar diferente entre renders — a lógica
  // de quando notificar é 100% da responsabilidade do gate (ver
  // src/utils/creditsSyncGate.ts, testado isoladamente).
  const creditsSyncGateRef = useRef(createCreditsSyncGate());
  // Leitura multipágina: sinaliza para o loop de renderização (local, ANTES
  // de qualquer chamada ao Gateway) que o usuário pediu para cancelar. Ref,
  // não estado — lido de dentro de um loop assíncrono já em voo.
  const cancelRequestedRef = useRef(false);

  // ── Estado detecção de tipo de arquivo ─────────────────────────────────────
  const [importFileType, setImportFileType]         = useState<ImportFileType | null>(null);
  const [fileReady, setFileReady]                   = useState(false);
  const [pendingCost, setPendingCost]               = useState(0);
  const [pendingExtractedText, setPendingExtractedText] = useState<string | null>(null);
  const [pendingPdfPageInfo, setPendingPdfPageInfo] = useState<DocumentPageInfo | null>(null);
  const [isDetecting, setIsDetecting]               = useState(false);

  // ── Leitura multipágina (PDF escaneado) ─────────────────────────────────────
  // Progresso da renderização LOCAL (antes de qualquer chamada à IA) — "Preparando
  // página X de N". `null` = fora da fase de renderização (nada, ou já chamando a IA).
  const [renderProgress, setRenderProgress] = useState<{ current: number; total: number } | null>(null);
  // Permite mostrar o botão de fechar durante a fase de renderização LOCAL de
  // um PDF multipágina (cancelamento seguro, sempre ANTES da chamada ao
  // Gateway) — nas demais tasks/arquivos o botão continua oculto durante o
  // processamento, exatamente como antes desta mudança.
  const [canCancelProcessing, setCanCancelProcessing] = useState(false);
  // Páginas realmente enviadas à IA (já sem as páginas em branco descartadas)
  // — usado só para exibir "Dados analisados nas páginas 1–N" na revisão.
  const [visualPagesIncluded, setVisualPagesIncluded] = useState<number[] | null>(null);

  // ── Avisos de cobertura do documento (páginas/truncamento) ─────────────────
  const [docxPageDisclosure, setDocxPageDisclosure]   = useState<string | null>(null);
  const [docxTruncationNotice, setDocxTruncationNotice] = useState<string | null>(null);

  // ── Estado animação IA ─────────────────────────────────────────────────────
  const [aiStageIdx, setAiStageIdx]   = useState(0);
  const [aiDoneStages, setAiDoneStages] = useState<number[]>([]);
  const aiTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Estado duplicidade ─────────────────────────────────────────────────────
  const [duplicateCandidates, setDuplicateCandidates] = useState<DuplicateCandidate[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Animação IA ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (step !== 'ai_processing') {
      if (aiTimerRef.current) { clearInterval(aiTimerRef.current); aiTimerRef.current = null; }
      setAiStageIdx(0);
      setAiDoneStages([]);
      return;
    }
    setAiStageIdx(0);
    setAiDoneStages([]);
    let cur = 0;
    // Avança os primeiros 4 estágios; o 5º fica girando até a IA responder
    aiTimerRef.current = setInterval(() => {
      if (cur < AI_STAGES.length - 1) {
        setAiDoneStages(prev => [...prev, cur]);
        cur++;
        setAiStageIdx(cur);
      }
      if (cur >= AI_STAGES.length - 1) {
        if (aiTimerRef.current) { clearInterval(aiTimerRef.current); aiTimerRef.current = null; }
      }
    }, 1700);
    return () => {
      if (aiTimerRef.current) { clearInterval(aiTimerRef.current); aiTimerRef.current = null; }
    };
  }, [step]);

  // ── Processamento CSV ──────────────────────────────────────────────────────
  const processCSVFile = useCallback((f: File) => {
    setParseError(null);
    if (!f.name.toLowerCase().endsWith('.csv') && f.type !== 'text/csv') {
      setParseError('Por favor, envie um arquivo no formato .csv');
      return;
    }
    setFile(f);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const res     = parseCSV(content);
        setParsed(res);
        setStep('preview');
      } catch (err: any) {
        setParseError(`Erro ao ler o arquivo: ${err?.message ?? 'formato inválido'}`);
      }
    };
    reader.readAsText(f, 'UTF-8');
  }, []);

  // ── Preparação de arquivo (detecta tipo antes de chamar IA) ──────────────
  const prepareDocumentFile = useCallback(async (f: File) => {
    setParseError(null);
    const ext = f.name.toLowerCase().match(/\.[^.]+$/)?.[0] ?? '';

    if (ext === '.doc') {
      setParseError(LEGACY_DOC_MESSAGE);
      return;
    }
    if (!ACCEPTED_DOC_EXTS.includes(ext)) {
      setParseError(UNSUPPORTED_FORMAT_MESSAGE);
      return;
    }

    setFile(f);
    setPendingExtractedText(null);
    setPendingPdfPageInfo(null);
    setDocxPageDisclosure(null);
    setDocxTruncationNotice(null);
    setFileReady(false);
    setVisualPagesIncluded(null);

    if (ext === '.docx') {
      setImportFileType('docx');
      setPendingCost(CREDITS_DOC_TEXT);
      setFileReady(true);
    } else if (ext === '.pdf') {
      setIsDetecting(true);
      try {
        const extraction = await extractTextFromPdf(f);
        if (extraction.text) {
          setImportFileType('pdf-text');
          setPendingCost(CREDITS_DOC_TEXT);
          setPendingExtractedText(extraction.text);
          setPendingPdfPageInfo({ totalPages: extraction.totalPages, pagesAnalyzed: extraction.pagesAnalyzed });
        } else {
          setImportFileType('pdf-image');
          setPendingCost(CREDITS_VISUAL);
          // Contagem real de páginas (pdf.numPages, já lida pelo pdfjs acima,
          // sem custo de IA) — usada no aviso pré-processamento e no botão de
          // confirmação abaixo. Leitura multipágina (27/08/2026): antes desta
          // mudança só a 1ª página era planejada; agora o plano é o mesmo do
          // Gateway (planMultiPagePdf) — até MAX_VISUAL_PDF_PAGES páginas.
          setPendingPdfPageInfo({
            totalPages: extraction.totalPages,
            pagesAnalyzed: Math.min(extraction.totalPages, MAX_VISUAL_PDF_PAGES),
          });
        }
      } catch {
        // PDF corrompido, protegido por senha ou não-legível → tenta via
        // visual. Não sabemos a contagem real de páginas neste caso (pdfjs
        // nem conseguiu abrir o arquivo) — pendingPdfPageInfo permanece null,
        // e o aviso informa honestamente que a contagem é desconhecida.
        setImportFileType('pdf-image');
        setPendingCost(CREDITS_VISUAL);
      } finally {
        setIsDetecting(false);
        setFileReady(true);
      }
    } else {
      // Imagem — valida o mimetype real antes de aceitar (correção da
      // auditoria de 25/08/2026: não aceitar silenciosamente um arquivo cujo
      // tipo real não é um dos formatos suportados pela leitura visual).
      if (!resolveAcceptedImageMimeType(f)) {
        setParseError(UNSUPPORTED_FORMAT_MESSAGE);
        setFile(null);
        return;
      }
      setImportFileType('image');
      setPendingCost(CREDITS_VISUAL);
      setFileReady(true);
    }
  }, []);

  // ── Processamento IA (chamado após confirmação de créditos) ────────────────
  // Consumo de créditos: o AI Gateway já reserva, chama o provider e
  // confirma (ou libera, em falha) o crédito atomicamente numa única
  // requisição — ver studentDocumentImportService.ts. Se `mapDocumentTextToStudentPayload`/
  // `mapVisualDocumentToStudentPayload` retornarem com sucesso, o crédito já
  // foi definitivamente cobrado; se lançarem, nenhum crédito foi cobrado.
  // Cancelar/fechar/trocar de arquivo DEPOIS deste ponto não devolve o valor.
  const runAIProcessing = useCallback(async () => {
    if (!file || !importFileType) return;
    if (isProcessingRef.current) return; // guarda contra duplo clique
    isProcessingRef.current = true;
    creditsSyncGateRef.current.beginAttempt();
    cancelRequestedRef.current = false;
    setRenderProgress(null);
    setVisualPagesIncluded(null);
    // Leitura multipágina: só o caminho de PDF escaneado tem uma fase de
    // renderização LOCAL cancelável (antes de qualquer chamada ao Gateway) —
    // nos demais tipos o botão de fechar continua oculto durante o
    // processamento, exatamente como antes desta mudança.
    setCanCancelProcessing(importFileType === 'pdf-image');
    setStep('ai_processing');
    setParseError(null);
    try {
      let aiResult;
      if (importFileType === 'docx') {
        const text = await extractTextFromDocx(file);
        aiResult = await mapDocumentTextToStudentPayload(text);
      } else if (importFileType === 'pdf-text' && pendingExtractedText) {
        aiResult = await mapDocumentTextToStudentPayload(pendingExtractedText, pendingPdfPageInfo ?? undefined);
      } else {
        aiResult = await mapVisualDocumentToStudentPayload(file, {
          onPageRenderStart: (current, total) => {
            // Aproxima "renderização terminou" ao iniciar a última página
            // planejada — a partir daí já mostramos "Analisando N páginas
            // com IA" (a chamada de rede começa logo em seguida).
            setRenderProgress(current >= total ? null : { current, total });
          },
          isCancelled: () => cancelRequestedRef.current,
        });
      }
      setCreditsCharged(aiResult.creditsConsumed);
      setDocxDrafts(aiResult.drafts.map(draftToEditable));
      setCurrentDraftIdx(0);
      setVisualPagesIncluded(aiResult.pagesIncluded ?? null);
      setDocxPageDisclosure(
        importFileType === 'pdf-image'
          // Leitura multipágina usa buildAnalyzedPagesLabel/buildMultiPageSuccessMessage
          // na revisão (cientes de páginas em branco descartadas no meio do
          // documento) em vez deste aviso genérico de "primeiras N páginas".
          ? null
          : aiResult.pageInfo ? buildPageDisclosureMessage(aiResult.pageInfo.totalPages, aiResult.pageInfo.pagesAnalyzed) : null,
      );
      setDocxTruncationNotice(aiResult.truncated ? DOCUMENT_TRUNCATION_NOTICE : null);
      setStep('ai_preview');
      // Análise utilizável confirmada pelo Gateway (crédito já cobrado no
      // banco nesta mesma chamada) — a revisão acabou de abrir. Sincroniza o
      // saldo exibido agora, uma única vez, sem nova chamada à IA.
      creditsSyncGateRef.current.notifyOnSuccess(() => onCreditsConsumed?.());
    } catch (err: any) {
      const rawMsg: string = err?.message ?? '';

      if (rawMsg === 'IMPORT_CANCELLED') {
        // Cancelado pelo usuário durante a renderização LOCAL — nenhuma
        // chamada ao Gateway chegou a ser feita, nenhum crédito envolvido.
        // O modal já foi fechado por handleClose; nada a exibir.
        return;
      }

      // Por construção do Gateway (reserve → provider → validar → commit/release,
      // tudo na mesma requisição), se chegamos aqui nenhum crédito foi
      // cobrado — a reserva (se chegou a existir) já foi liberada do lado do
      // servidor antes mesmo desta resposta de erro chegar ao navegador. O
      // mesmo vale para falhas na preparação LOCAL do PDF (PAGE_RENDER_FAILED/
      // NO_READABLE_PAGES): elas acontecem ANTES de qualquer reserva existir.
      let friendlyMsg: string;
      if (rawMsg.startsWith('INSUFFICIENT_CREDITS')) {
        friendlyMsg = 'Saldo de créditos insuficiente para esta análise.';
      } else if (rawMsg.startsWith('PAGE_RENDER_FAILED') || rawMsg === 'NO_READABLE_PAGES') {
        console.warn('[DocImport] Falha na preparação local do PDF:', rawMsg);
        friendlyMsg = 'Não conseguimos analisar este documento. Nenhum crédito foi consumido.';
      } else {
        const cause = rawMsg || 'Não foi possível concluir a análise.';
        friendlyMsg = /cr[eé]dito/i.test(cause) ? cause : `${cause} Nenhum crédito foi consumido.`;
      }
      setParseError(friendlyMsg);
      setStep('upload');
      setFileReady(false);
    } finally {
      isProcessingRef.current = false;
      setCanCancelProcessing(false);
      setRenderProgress(null);
    }
  }, [file, importFileType, pendingExtractedText, pendingPdfPageInfo, onCreditsConsumed]);

  // ── Drop / change handlers ─────────────────────────────────────────────────
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const f = e.dataTransfer.files[0];
    if (!f) return;
    if (importMode === 'docx') prepareDocumentFile(f);
    else processCSVFile(f);
  }, [importMode, processCSVFile, prepareDocumentFile]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      if (importMode === 'docx') prepareDocumentFile(f);
      else processCSVFile(f);
    }
    e.target.value = '';
  };

  // ── Importação CSV ─────────────────────────────────────────────────────────
  const handleCSVImport = async () => {
    if (!parsed || parsed.validRows.length === 0) return;
    setStep('importing');
    setProgress(0);
    try {
      const res = await importStudentsBatch(
        parsed.validRows, tenantId, userId,
        file?.name ?? 'importacao.csv',
        (pct) => setProgress(pct),
      );
      setResult(res);
      setStep('done');
    } catch (e: any) {
      setParseError(`Erro durante a importação: ${e?.message ?? String(e)}`);
      setStep('preview');
    }
  };

  // ── Salvamento DOCX (com detecção de duplicidade) ──────────────────────────
  const handleDocxSave = async (force = false) => {
    if (docxDrafts.length === 0 || docxIsSaving) return;

    if (!force && existingStudents && existingStudents.length > 0) {
      const candidates = findDuplicateCandidates(docxDrafts, existingStudents);
      if (candidates.length > 0) {
        setDuplicateCandidates(candidates);
        return;
      }
    }

    setDuplicateCandidates([]);
    setDocxIsSaving(true);
    setParseError(null);
    try {
      // O crédito da análise já foi cobrado quando a revisão foi
      // disponibilizada (ver runAIProcessing) — salvar não cobra de novo,
      // independentemente do resultado abaixo.
      const res = await saveStudentsFromDocx(docxDrafts, tenantId, userId, importFileType ?? 'docx');

      if (res.saved === 0) {
        res.errors = res.errors.length > 0
          ? res.errors
          : ['Nenhum aluno foi salvo.'];
      }

      setDocxSaveResult(res);
      setStep('done');
    } catch (err: any) {
      const msg: string = err?.message ?? String(err);
      if (msg.includes('students_import_source_check')) {
        console.error('students_import_source_check: import_source inválido enviado pelo importador.', { importFileType, msg });
        setParseError('A importação não foi concluída. (Origem do arquivo não reconhecida — atualize a página e tente novamente.)');
      } else {
        setParseError(`A importação não foi concluída. ${msg || 'Erro ao salvar. Tente novamente.'}`);
      }
    } finally {
      setDocxIsSaving(false);
    }
  };

  // ── Edição de draft ────────────────────────────────────────────────────────
  const updateDraft = (idx: number, field: keyof EditableDraft, value: string) => {
    setDocxDrafts(prev => prev.map((d, i) => i === idx ? { ...d, [field]: value } : d));
  };

  // ── Trocar modo ────────────────────────────────────────────────────────────
  const switchMode = (mode: ImportMode) => {
    setImportMode(mode);
    setParseError(null);
    setParsed(null);
    setFile(null);
    setDocxDrafts([]);
    setDuplicateCandidates([]);
    setImportFileType(null);
    setFileReady(false);
    setPendingCost(0);
    setPendingExtractedText(null);
    setPendingPdfPageInfo(null);
    setDocxPageDisclosure(null);
    setDocxTruncationNotice(null);
    setCreditsCharged(null);
    setIsDetecting(false);
    setRenderProgress(null);
    setVisualPagesIncluded(null);
  };

  // ── Fechar modal ────────────────────────────────────────────────────────────
  // Não há mais reserva para liberar aqui: se uma análise já foi entregue
  // (ai_preview), o crédito já foi cobrado definitivamente e fechar o modal
  // sem salvar não devolve o valor (regra de negócio de 26/08/2026).
  //
  // Rede de segurança do saldo: normalmente o saldo já foi sincronizado no
  // instante em que a revisão abriu (creditsSyncGateRef.notifyOnSuccess em
  // runAIProcessing). O gate só dispara aqui se uma análise chegou a ser
  // tentada e ainda não foi sincronizada (ex.: fechou durante a chamada) —
  // e nunca duplica, nem dispara se nada chegou a ser processado.
  //
  // Leitura multipágina: se o fechamento aconteceu durante a fase de
  // renderização LOCAL (canCancelProcessing), sinaliza o cancelamento para o
  // loop em voo — ele para ANTES de qualquer chamada ao Gateway. Depois que
  // a fase local termina e a chamada de rede começa, este sinal não tem mais
  // efeito (o botão de fechar já volta a ficar oculto nesse ponto).
  const handleClose = useCallback(() => {
    if (isProcessingRef.current && canCancelProcessing) {
      cancelRequestedRef.current = true;
    }
    creditsSyncGateRef.current.notifyOnClose(() => onCreditsConsumed?.());
    onClose();
  }, [onClose, onCreditsConsumed, canCancelProcessing]);

  // ── Configuração dos steps ─────────────────────────────────────────────────
  const csvStepOrder  = ['upload', 'preview', 'importing', 'done'];
  const docxStepOrder = ['upload', 'ai_processing', 'ai_preview', 'done'];
  const stepOrder  = importMode === 'csv' ? csvStepOrder : docxStepOrder;
  const stepLabels = importMode === 'csv'
    ? ['1. Arquivo', '2. Revisão', '3. Importando', '4. Concluído']
    : ['1. Arquivo', '2. Analisando', '3. Revisão', '4. Concluído'];
  const currentStepIdx = stepOrder.indexOf(step);

  // ── Resumo CSV preview ─────────────────────────────────────────────────────
  const previewCounts = parsed ? {
    total:      parsed.validRows.length,
    complete:   parsed.validRows.filter(r => r.registrationStatus === 'complete').length,
    incomplete: parsed.validRows.filter(r => r.registrationStatus === 'incomplete').length,
    preReg:     parsed.validRows.filter(r => r.registrationStatus === 'pre_registered').length,
    errors:     parsed.errorRows.length,
  } : null;

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(3px)' }}
    >
      <div
        className="relative w-full flex flex-col rounded-2xl overflow-hidden"
        style={{
          background:  C.surface,
          border:      `1.5px solid ${C.border}`,
          maxWidth:    860,
          maxHeight:   '92vh',
          boxShadow:   '0 24px 64px rgba(0,0,0,0.18)',
        }}
      >
        {/* ── Header ────────────────────────────────────────────────────── */}
        <div
          className="flex items-center justify-between px-6 py-4 border-b shrink-0"
          style={{ borderColor: C.border, background: C.bg }}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                 style={{ background: importMode === 'docx' ? C.gold : C.petrol }}>
              {importMode === 'docx'
                ? <Sparkles size={18} color="#fff" />
                : <FileUp size={18} color="#fff" />
              }
            </div>
            <div>
              <h2 className="text-base font-bold" style={{ color: C.dark }}>
                Importar Alunos
              </h2>
              <p className="text-xs" style={{ color: C.textSec }}>
                {step === 'upload'        && 'Escolha o formato de importação'}
                {step === 'preview'       && `${previewCounts?.total ?? 0} aluno(s) identificados — revise antes de importar`}
                {step === 'importing'     && 'Criando cadastros…'}
                {step === 'ai_processing' && `Analisando ${importFileType === 'image' || importFileType === 'pdf-image' ? 'imagem' : 'documento'}…`}
                {step === 'ai_preview'    && `${docxDrafts.length} aluno(s) encontrado(s) — revise e confirme`}
                {step === 'done'          && 'Importação concluída'}
              </p>
            </div>
          </div>
          {(step !== 'importing' && (step !== 'ai_processing' || canCancelProcessing)) && (
            <button
              onClick={handleClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center transition hover:opacity-70"
              style={{ background: C.border }}
            >
              <X size={16} style={{ color: C.dark }} />
            </button>
          )}
        </div>

        {/* ── Indicador de progresso ─────────────────────────────────────── */}
        <div className="flex items-center gap-0 px-6 pt-4 shrink-0">
          {stepLabels.map((label, idx) => {
            const isPast   = currentStepIdx > idx;
            const isActive = currentStepIdx === idx;
            return (
              <React.Fragment key={label}>
                <div className="flex items-center gap-1.5">
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold"
                    style={{
                      background: isPast ? C.green : isActive ? C.petrol : C.border,
                      color:      isPast || isActive ? '#fff' : C.textSec,
                    }}
                  >
                    {isPast ? '✓' : idx + 1}
                  </div>
                  <span className="text-xs font-medium hidden sm:block"
                        style={{ color: isActive ? C.dark : C.textSec }}>
                    {label}
                  </span>
                </div>
                {idx < 3 && (
                  <div className="flex-1 h-px mx-2" style={{ background: isPast ? C.green : C.border }} />
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* ── Conteúdo scrollável ────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">

          {/* ══════════════════════════════════════════════════════════════
              STEP: UPLOAD
          ══════════════════════════════════════════════════════════════ */}
          {step === 'upload' && (
            <div className="p-6 flex flex-col gap-5">

              {/* Seletor de modo */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => switchMode('csv')}
                  className="flex flex-col items-start gap-2 p-4 rounded-xl text-left transition-all"
                  style={{
                    border:     `2px solid ${importMode === 'csv' ? C.petrol : C.border}`,
                    background: importMode === 'csv' ? 'rgba(31,78,95,0.05)' : C.surface,
                  }}
                >
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                       style={{ background: importMode === 'csv' ? C.petrol : C.border }}>
                    <Sheet size={16} color={importMode === 'csv' ? '#fff' : C.textSec} />
                  </div>
                  <div>
                    <p className="text-sm font-bold" style={{ color: C.dark }}>Planilha CSV</p>
                    <p className="text-xs mt-0.5" style={{ color: C.textSec }}>Lista de alunos em formato de tabela</p>
                  </div>
                </button>

                <button
                  onClick={() => switchMode('docx')}
                  className="flex flex-col items-start gap-2 p-4 rounded-xl text-left transition-all"
                  style={{
                    border:     `2px solid ${importMode === 'docx' ? C.gold : C.border}`,
                    background: importMode === 'docx' ? '#FDF6E3' : C.surface,
                  }}
                >
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                       style={{ background: importMode === 'docx' ? C.gold : C.border }}>
                    <Sparkles size={16} color={importMode === 'docx' ? '#fff' : C.textSec} />
                  </div>
                  <div>
                    <p className="text-sm font-bold" style={{ color: C.dark }}>
                      Documento com IA ✨
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: C.textSec }}>
                      Ficha de cadastro, matrícula ou anamnese — Word (.docx), PDF, JPG, PNG ou WEBP
                    </p>
                  </div>
                </button>
              </div>

              {/* ── CSV: botões de modelo + exemplo ── */}
              {importMode === 'csv' && (
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={downloadTemplate}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition hover:opacity-85"
                    style={{ background: C.petrol, boxShadow: '0 4px 12px rgba(31,78,95,0.22)' }}
                  >
                    <Download size={15} /> Baixar modelo CSV
                  </button>
                  <button
                    onClick={downloadExample}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition hover:opacity-80"
                    style={{ background: C.goldLight, color: C.gold, border: `1.5px solid ${C.gold}` }}
                  >
                    <FileText size={15} /> Baixar exemplo preenchido
                  </button>
                  <button
                    onClick={() => setShowExample(v => !v)}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition hover:opacity-80"
                    style={{ background: C.bg, color: C.dark, border: `1.5px solid ${C.border}` }}
                  >
                    {showExample ? <EyeOff size={15}/> : <Eye size={15}/>}
                    {showExample ? 'Ocultar exemplo' : 'Ver exemplo'}
                  </button>
                </div>
              )}

              {/* CSV: exemplo inline */}
              {importMode === 'csv' && showExample && (
                <div className="rounded-xl overflow-auto border" style={{ borderColor: C.border }}>
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{ background: C.bg }}>
                        {TEMPLATE_HEADERS.map(h => (
                          <th key={h} className="px-3 py-2 text-left font-semibold whitespace-nowrap"
                              style={{ color: C.dark, borderBottom: `1px solid ${C.border}` }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {TEMPLATE_EXAMPLE_ROWS.map((row, i) => (
                        <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                          {row.map((cell, j) => (
                            <td key={j} className="px-3 py-2 whitespace-nowrap"
                                style={{ color: cell ? C.text : C.textSec }}>
                              {cell || <span className="italic opacity-50">vazio</span>}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* ── Detectando tipo de PDF ── */}
              {importMode === 'docx' && isDetecting && (
                <div
                  className="rounded-2xl flex items-center justify-center gap-3"
                  style={{ border: `2px dashed ${C.borderMid}`, background: C.bg, padding: '40px 24px', minHeight: 160 }}
                >
                  <Loader2 size={18} className="animate-spin" style={{ color: C.gold }} />
                  <p className="text-sm" style={{ color: C.textSec }}>Analisando PDF…</p>
                </div>
              )}

              {/* ── Painel de confirmação de créditos ── */}
              {importMode === 'docx' && fileReady && file && !isDetecting && (
                <div className="rounded-2xl overflow-hidden" style={{ border: `1.5px solid ${C.border}` }}>
                  {/* Cabeçalho com arquivo */}
                  <div className="flex items-center gap-3 p-4" style={{ background: C.bg }}>
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                         style={{ background: C.gold + '20' }}>
                      <FileSearch size={20} style={{ color: C.gold }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate" style={{ color: C.dark }}>{file.name}</p>
                      <p className="text-xs mt-0.5" style={{ color: C.textSec }}>{getFileTypeLabel(importFileType)}</p>
                    </div>
                    <button
                      onClick={() => { setFile(null); setFileReady(false); setImportFileType(null); setPendingExtractedText(null); setPendingPdfPageInfo(null); }}
                      className="text-xs font-medium transition hover:opacity-70 flex-shrink-0 px-2 py-1 rounded-lg"
                      style={{ color: C.textSec, background: C.border }}
                    >
                      Trocar
                    </button>
                  </div>

                  {/* Custo em créditos — cobrado quando a IA entregar os
                      dados para revisão, não quando o aluno for salvo */}
                  <div className="px-4 py-3" style={{ borderTop: `1px solid ${C.border}` }}>
                    <p className="text-sm" style={{ color: C.text }}>
                      {`A análise deste documento consumirá ${pendingCost} créditos quando os dados forem disponibilizados para revisão.`}
                    </p>
                  </div>

                  {/* Aviso de qualidade para documentos visuais */}
                  {(importFileType === 'image' || importFileType === 'pdf-image') && (
                    <div className="flex items-start gap-2 px-4 py-3"
                         style={{ borderTop: `1px solid ${C.border}`, background: C.amberLight }}>
                      <AlertTriangle size={13} style={{ color: C.amber, marginTop: 2, flexShrink: 0 }} />
                      <p className="text-xs" style={{ color: '#92400e' }}>
                        {importFileType === 'pdf-image'
                          ? `${buildMultiPagePreProcessingNotice(pendingPdfPageInfo?.totalPages ?? null)} Para melhores resultados, envie imagem nítida e bem iluminada.`
                          : 'Para melhores resultados, envie imagem nítida, bem iluminada e com o texto legível.'
                        }
                      </p>
                    </div>
                  )}

                  {/* Botão confirmar */}
                  <div className="px-4 py-3" style={{ borderTop: `1px solid ${C.border}` }}>
                    <button
                      onClick={runAIProcessing}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-white transition hover:opacity-85"
                      style={{ background: C.gold, boxShadow: '0 4px 12px rgba(198,146,20,0.25)' }}
                    >
                      <Sparkles size={15} />
                      {importFileType === 'pdf-image'
                        ? buildMultiPageButtonLabel(pendingPdfPageInfo?.totalPages ?? 1, pendingCost)
                        : `Processar com IA — ${pendingCost} créditos`
                      }
                    </button>
                  </div>
                </div>
              )}

              {/* ── Zona de upload (drop) ── */}
              {(!fileReady && !isDetecting) && (
                <div
                  onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-2xl flex flex-col items-center justify-center gap-3 cursor-pointer transition-all"
                  style={{
                    border:     `2px dashed ${isDragOver ? (importMode === 'docx' ? C.gold : C.petrol) : C.borderMid}`,
                    background: isDragOver
                      ? (importMode === 'docx' ? 'rgba(198,146,20,0.04)' : 'rgba(31,78,95,0.04)')
                      : C.bg,
                    padding:    '40px 24px',
                    minHeight:  160,
                  }}
                >
                  <div
                    className="w-14 h-14 rounded-2xl flex items-center justify-center"
                    style={{
                      background: isDragOver
                        ? (importMode === 'docx' ? C.gold : C.petrol)
                        : '#EEF4F7',
                    }}
                  >
                    {importMode === 'docx'
                      ? <FileSearch size={26} color={isDragOver ? '#fff' : C.gold} />
                      : <Upload    size={26} color={isDragOver ? '#fff' : C.petrol} />
                    }
                  </div>
                  <div className="text-center">
                    <p className="font-semibold text-sm" style={{ color: C.dark }}>
                      {isDragOver
                        ? 'Solte o arquivo aqui'
                        : importMode === 'docx'
                          ? 'Arraste seu arquivo aqui'
                          : 'Arraste seu arquivo CSV'
                      }
                    </p>
                    <p className="text-xs mt-1" style={{ color: C.textSec }}>
                      {importMode === 'docx'
                        ? 'ou clique para selecionar • .docx, .pdf, .jpg, .png, .webp'
                        : 'ou clique para selecionar • aceita vírgula e ponto-e-vírgula'
                      }
                    </p>
                  </div>
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept={importMode === 'docx' ? '.docx,.pdf,.png,.jpg,.jpeg,.webp' : '.csv,text/csv'}
                className="hidden"
                onChange={handleFileChange}
              />

              {/* Info box DOCX */}
              {importMode === 'docx' && !fileReady && !isDetecting && (
                <div
                  className="flex items-start gap-3 p-4 rounded-xl"
                  style={{ background: '#FDF6E3', border: `1px solid ${C.gold}40` }}
                >
                  <Sparkles size={16} style={{ color: C.gold, marginTop: 2, flexShrink: 0 }} />
                  <div>
                    <p className="text-sm font-semibold" style={{ color: C.dark }}>
                      Envie uma ficha de cadastro, matrícula ou anamnese
                    </p>
                    <p className="text-xs mt-1" style={{ color: C.textSec }}>
                      A IA identifica os dados compatíveis com o cadastro do aluno — nome, data de nascimento, série,
                      turma, turno, escola e responsável, por exemplo. O cadastro pode ficar incompleto: você poderá
                      anexar laudos e relatórios depois, no perfil do aluno. Nenhum aluno é criado automaticamente —
                      você revisa e confirma tudo primeiro.
                    </p>
                    <p className="text-xs mt-1.5 font-medium" style={{ color: C.amber }}>
                      PDF / Word (.docx) com texto: {CREDITS_DOC_TEXT} créditos &nbsp;·&nbsp; Imagem / PDF escaneado: {CREDITS_VISUAL} créditos
                    </p>
                  </div>
                </div>
              )}

              {importMode === 'csv' && (
                <div
                  className="flex items-start gap-3 p-4 rounded-xl"
                  style={{ background: '#EEF4F7', border: '1px solid #C5D9E2' }}
                >
                  <Info size={16} style={{ color: C.petrol, marginTop: 2, flexShrink: 0 }} />
                  <p className="text-sm" style={{ color: C.dark }}>
                    <strong>Dica:</strong> Baixe o modelo acima, preencha e salve como .csv.
                    Aceita vírgula (<code>,</code>) ou ponto-e-vírgula (<code>;</code>) como separador.
                  </p>
                </div>
              )}

              {parseError && (
                <div className="flex items-start gap-2 p-3 rounded-xl text-sm"
                     style={{ background: C.redLight, color: C.red }}>
                  <AlertCircle size={15} className="mt-0.5 shrink-0" />
                  {parseError}
                </div>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════
              STEP: PREVIEW (CSV)
          ══════════════════════════════════════════════════════════════ */}
          {step === 'preview' && parsed && previewCounts && (
            <div className="p-6 flex flex-col gap-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Completos',     value: previewCounts.complete,   color: C.green,  bg: C.greenLight  },
                  { label: 'Incompletos',   value: previewCounts.incomplete, color: C.amber,  bg: C.amberLight  },
                  { label: 'Pré-cadastros', value: previewCounts.preReg,     color: C.red,    bg: C.redLight    },
                  { label: 'Erros (ign.)',  value: previewCounts.errors,     color: C.textSec, bg: C.bg         },
                ].map(({ label, value, color, bg }) => (
                  <div key={label} className="rounded-xl p-3 text-center"
                       style={{ background: bg, border: `1px solid ${color}30` }}>
                    <p className="text-2xl font-extrabold" style={{ color }}>{value}</p>
                    <p className="text-xs mt-0.5" style={{ color }}>{label}</p>
                  </div>
                ))}
              </div>

              {parsed.unrecognizedHeaders.length > 0 && (
                <div className="flex items-start gap-2 p-3 rounded-xl text-xs"
                     style={{ background: C.amberLight, color: C.amber }}>
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  <span>
                    Colunas não reconhecidas (serão ignoradas):{' '}
                    <strong>{parsed.unrecognizedHeaders.join(', ')}</strong>
                  </span>
                </div>
              )}

              <div className="flex flex-wrap gap-3 text-xs" style={{ color: C.textSec }}>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded-full inline-block" style={{ background: C.green }} />
                  Completo
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded-full inline-block" style={{ background: C.amber }} />
                  Incompleto
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded-full inline-block" style={{ background: C.red }} />
                  Pré-cadastro
                </span>
              </div>

              <div className="rounded-xl overflow-auto border" style={{ borderColor: C.border, maxHeight: 340 }}>
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ background: C.bg, position: 'sticky', top: 0 }}>
                      {['#', 'Nome', 'Data Nasc.', 'Série', 'Responsável', 'Telefone', 'CID', 'Status'].map(h => (
                        <th key={h} className="px-3 py-2.5 text-left font-semibold whitespace-nowrap"
                            style={{ color: C.dark, borderBottom: `1px solid ${C.border}` }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.validRows.map(row => (
                      <tr key={row.rowIndex}
                          style={{ borderBottom: `1px solid ${C.border}`, borderLeft: `3px solid ${RowBorderColor(row.registrationStatus)}` }}>
                        <td className="px-3 py-2" style={{ color: C.textSec }}>{row.rowIndex}</td>
                        <td className="px-3 py-2 font-medium" style={{ color: C.dark }}>{row.name}</td>
                        <td className="px-3 py-2" style={{ color: C.text }}>
                          {row.birthDate
                            ? (() => { const [y,m,d] = row.birthDate.split('-'); return `${d}/${m}/${y}`; })()
                            : <span style={{ color: C.textSec }}>—</span>
                          }
                        </td>
                        <td className="px-3 py-2" style={{ color: C.text }}>{row.grade || <span style={{ color: C.textSec }}>—</span>}</td>
                        <td className="px-3 py-2" style={{ color: C.text }}>{row.guardianName || <span style={{ color: C.textSec }}>—</span>}</td>
                        <td className="px-3 py-2" style={{ color: C.text }}>{row.guardianPhone || <span style={{ color: C.textSec }}>—</span>}</td>
                        <td className="px-3 py-2" style={{ color: C.text }}>{row.cid || <span style={{ color: C.textSec }}>—</span>}</td>
                        <td className="px-3 py-2">
                          <div className="flex flex-col gap-1">
                            <StatusBadge status={row.registrationStatus} />
                            {row.missingRequiredFields.length > 0 && (
                              <span className="text-xs" style={{ color: C.textSec }}>
                                Falta: {row.missingRequiredFields.join(', ')}
                              </span>
                            )}
                            {row.genderWarning && (
                              <span className="text-xs" style={{ color: C.amber }}>⚠ {row.genderWarning}</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {parsed.errorRows.map(row => (
                      <tr key={`err-${row.rowIndex}`}
                          style={{ borderBottom: `1px solid ${C.border}`, opacity: 0.5, borderLeft: `3px solid ${C.borderMid}` }}>
                        <td className="px-3 py-2" style={{ color: C.textSec }}>{row.rowIndex}</td>
                        <td className="px-3 py-2 italic" style={{ color: C.textSec }} colSpan={6}>
                          {row.errorMessage ?? 'Linha inválida'}
                        </td>
                        <td className="px-3 py-2">
                          <span className="text-xs px-2 py-0.5 rounded-full"
                                style={{ background: C.border, color: C.textSec }}>Ignorado</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {(previewCounts.incomplete + previewCounts.preReg) > 0 && (
                <div className="flex items-start gap-3 p-4 rounded-xl"
                     style={{ background: C.amberLight, border: `1px solid ${C.amber}40` }}>
                  <AlertTriangle size={16} style={{ color: C.amber, flexShrink: 0, marginTop: 2 }} />
                  <div>
                    <p className="text-sm font-semibold" style={{ color: C.dark }}>
                      {previewCounts.incomplete + previewCounts.preReg} aluno(s) com cadastro incompleto
                    </p>
                    <p className="text-xs mt-1" style={{ color: C.textSec }}>
                      Serão criados como pré-cadastro. Complete os campos depois diretamente no perfil do aluno.
                    </p>
                  </div>
                </div>
              )}

              {parseError && (
                <div className="flex items-start gap-2 p-3 rounded-xl text-sm"
                     style={{ background: C.redLight, color: C.red }}>
                  <AlertCircle size={15} className="mt-0.5 shrink-0" /> {parseError}
                </div>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════
              STEP: IMPORTING (CSV)
          ══════════════════════════════════════════════════════════════ */}
          {step === 'importing' && (
            <div className="p-10 flex flex-col items-center gap-6">
              <div className="w-20 h-20 rounded-2xl flex items-center justify-center"
                   style={{ background: '#EEF4F7' }}>
                <Loader2 size={36} style={{ color: C.petrol }} className="animate-spin" />
              </div>
              <div className="text-center">
                <p className="text-lg font-bold" style={{ color: C.dark }}>Criando cadastros…</p>
                <p className="text-sm mt-1" style={{ color: C.textSec }}>Aguarde enquanto os alunos são importados.</p>
              </div>
              <div className="w-full max-w-xs">
                <div className="flex justify-between text-xs mb-1.5" style={{ color: C.textSec }}>
                  <span>Progresso</span><span>{progress}%</span>
                </div>
                <div className="w-full h-3 rounded-full overflow-hidden" style={{ background: C.border }}>
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{ width: `${progress}%`, background: `linear-gradient(90deg, ${C.petrol}, ${C.gold})` }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════
              STEP: AI_PROCESSING (DOCX) — tela premium com etapas
          ══════════════════════════════════════════════════════════════ */}
          {step === 'ai_processing' && (
            <div className="p-10 flex flex-col items-center gap-8">

              {/* Ícone pulsante */}
              <div className="relative">
                <div
                  className="w-20 h-20 rounded-2xl flex items-center justify-center animate-pulse"
                  style={{ background: '#FDF6E3' }}
                >
                  <Sparkles size={34} style={{ color: C.gold }} />
                </div>
                <div
                  className="absolute -inset-1 rounded-2xl opacity-20 animate-ping"
                  style={{ background: C.gold }}
                />
              </div>

              <div className="text-center">
                <p className="text-lg font-bold" style={{ color: C.dark }}>
                  {renderProgress
                    ? `Preparando página ${renderProgress.current} de ${renderProgress.total}`
                    : importFileType === 'pdf-image' && (pendingPdfPageInfo?.pagesAnalyzed ?? 1) > 1
                      ? `Analisando ${pendingPdfPageInfo?.pagesAnalyzed} páginas com IA`
                      : importFileType === 'image' || importFileType === 'pdf-image'
                        ? 'A IA está analisando a imagem'
                        : 'A IA está lendo o documento'
                  }
                </p>
                <p className="text-xs mt-1" style={{ color: C.textSec }}>
                  {file?.name}
                </p>
              </div>

              {/* Lista de etapas animadas */}
              <div className="flex flex-col gap-3 w-full max-w-xs">
                {AI_STAGES.map((label, idx) => {
                  const isDone   = aiDoneStages.includes(idx);
                  const isActive = aiStageIdx === idx && !isDone;
                  return (
                    <div key={idx} className="flex items-center gap-3">
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-500"
                        style={{
                          background: isDone ? C.green : isActive ? C.gold : C.border,
                        }}
                      >
                        {isDone
                          ? <span style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>✓</span>
                          : isActive
                            ? <Loader2 size={12} style={{ color: '#fff' }} className="animate-spin" />
                            : <span style={{ color: C.textSec, fontSize: 10 }}>{idx + 1}</span>
                        }
                      </div>
                      <span
                        className="text-sm transition-all duration-300"
                        style={{
                          color:      isDone ? C.green : isActive ? C.dark : C.textSec,
                          fontWeight: isActive ? 600 : 400,
                        }}
                      >
                        {label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════
              STEP: AI_PREVIEW (DOCX) — formulário editável premium
          ══════════════════════════════════════════════════════════════ */}
          {step === 'ai_preview' && docxDrafts.length > 0 && (() => {
            const draft  = docxDrafts[currentDraftIdx];
            const update = (field: keyof EditableDraft, value: string) =>
              updateDraft(currentDraftIdx, field, value);
            const isFlag = (f: string) => draft.needsReview.includes(f);

            return (
              <div className="p-6 flex flex-col gap-4">

                {/* Confirmação discreta de consumo — a análise já foi cobrada
                    definitivamente neste ponto; cancelar depois não devolve. */}
                {creditsCharged != null && (
                  <p className="text-xs" style={{ color: C.textSec }}>
                    {importFileType === 'pdf-image' && visualPagesIncluded && visualPagesIncluded.length > 0
                      ? buildMultiPageSuccessMessage(visualPagesIncluded.length, creditsCharged)
                      : `Análise concluída — ${creditsCharged} ${creditsCharged === 1 ? 'crédito utilizado' : 'créditos utilizados'}.`
                    }
                  </p>
                )}

                {/* Leitura multipágina: quais páginas exatamente entraram na análise
                    (discreto — já sem as páginas em branco descartadas). */}
                {importFileType === 'pdf-image' && visualPagesIncluded && visualPagesIncluded.length > 0 && (
                  <p className="text-xs" style={{ color: C.textSec }}>
                    {buildAnalyzedPagesLabel(visualPagesIncluded)}
                  </p>
                )}

                {/* Banner multi-aluno */}
                {docxDrafts.length > 1 && (
                  <div className="flex items-center gap-3 p-3 rounded-xl"
                       style={{ background: '#EEF4F7', border: `1px solid ${C.petrol}25` }}>
                    <Users size={16} style={{ color: C.petrol, flexShrink: 0 }} />
                    <p className="text-sm font-semibold" style={{ color: C.dark }}>
                      Encontramos {docxDrafts.length} alunos neste documento
                    </p>
                  </div>
                )}

                {/* Tabs de alunos (multi-aluno) */}
                {docxDrafts.length > 1 && (
                  <div className="flex flex-wrap gap-2">
                    {docxDrafts.map((d, i) => (
                      <button
                        key={i}
                        onClick={() => setCurrentDraftIdx(i)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold transition"
                        style={{
                          background: i === currentDraftIdx ? C.petrol : C.bg,
                          color:      i === currentDraftIdx ? '#fff' : C.dark,
                          border:     `1.5px solid ${i === currentDraftIdx ? C.petrol : C.border}`,
                        }}
                      >
                        Aluno {i + 1}{d.name ? `: ${d.name.split(' ')[0]}` : ''}
                      </button>
                    ))}
                  </div>
                )}

                {/* Avisos de cobertura do documento (páginas não analisadas / conteúdo cortado) */}
                {(docxPageDisclosure || docxTruncationNotice) && (
                  <div className="flex flex-col gap-2">
                    {docxPageDisclosure && (
                      <div className="flex items-start gap-2 p-3 rounded-xl text-xs"
                           style={{ background: '#EEF4F7', color: C.petrol }}>
                        <Info size={13} className="mt-0.5 shrink-0" />
                        {docxPageDisclosure}
                      </div>
                    )}
                    {docxTruncationNotice && (
                      <div className="flex items-start gap-2 p-3 rounded-xl text-xs"
                           style={{ background: C.amberLight, color: C.amber }}>
                        <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                        {docxTruncationNotice}
                      </div>
                    )}
                  </div>
                )}

                {/* Nome não identificado — cadastro exige preenchimento manual, IA nunca inventa */}
                {!draft.name.trim() && (
                  <div className="flex items-start gap-2 p-3 rounded-xl text-xs"
                       style={{ background: C.redLight, color: C.red }}>
                    <AlertCircle size={13} className="mt-0.5 shrink-0" />
                    Não encontramos o nome do aluno neste documento. Preencha o campo "Nome do Aluno" abaixo para poder salvar o cadastro.
                  </div>
                )}

                {/* Badge de confiança */}
                <ConfidenceBadge confidence={draft.confidence} />

                {/* Aviso de campos para revisar */}
                {draft.needsReview.length > 0 && (
                  <div className="flex items-start gap-2 p-3 rounded-xl text-xs"
                       style={{ background: C.amberLight, color: C.amber }}>
                    <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                    <span>
                      {draft.needsReview.length === 1
                        ? 'Um campo foi extraído com incerteza'
                        : `${draft.needsReview.length} campos foram extraídos com incerteza`
                      } — os marcados com ⚠ precisam da sua revisão antes de salvar.
                    </span>
                  </div>
                )}

                {/* Alerta de duplicidade */}
                {duplicateCandidates.length > 0 && (
                  <div className="rounded-xl overflow-hidden"
                       style={{ border: `2px solid ${C.amber}` }}>
                    <div className="px-4 py-3 flex items-center gap-2"
                         style={{ background: `${C.amber}18` }}>
                      <AlertTriangle size={15} style={{ color: C.amber }} />
                      <p className="text-sm font-bold" style={{ color: C.dark }}>
                        Possível aluno já existente
                      </p>
                    </div>
                    <div className="px-4 py-3 flex flex-col gap-3"
                         style={{ background: C.amberLight }}>
                      {duplicateCandidates.map((c, i) => (
                        <p key={i} className="text-sm" style={{ color: C.dark }}>
                          <strong>{c.draftName}</strong> pode já estar cadastrado como{' '}
                          <strong>{c.matchName}</strong>.
                        </p>
                      ))}
                      <div className="flex gap-2 mt-1">
                        <button
                          onClick={() => setDuplicateCandidates([])}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold transition hover:opacity-80"
                          style={{ background: C.surface, color: C.dark, border: `1px solid ${C.border}` }}
                        >
                          Cancelar
                        </button>
                        <button
                          onClick={() => handleDocxSave(true)}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition hover:opacity-85"
                          style={{ background: C.amber }}
                        >
                          Criar mesmo assim
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Seções do formulário editável ── */}

                {/* Dados Pessoais */}
                <PreviewCard>
                  <SectionHeader title="Dados Pessoais" />
                  <div className="grid grid-cols-2 gap-3">
                    <Field
                      label="Nome do Aluno *"
                      value={draft.name}
                      onChange={v => update('name', v)}
                      flagged={isFlag('name')}
                    />
                    <Field
                      label="Data de Nascimento"
                      value={draft.birthDate}
                      onChange={v => update('birthDate', v)}
                      hint="AAAA-MM-DD"
                      flagged={isFlag('birthDate')}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <GenderSelect
                      value={draft.gender}
                      onChange={v => update('gender', v)}
                      flagged={isFlag('gender')}
                    />
                    <div />
                  </div>
                </PreviewCard>

                {/* Responsável Legal */}
                <PreviewCard>
                  <SectionHeader title="Responsável Legal" />
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Nome do Responsável" value={draft.guardianName} onChange={v => update('guardianName', v)} flagged={isFlag('guardianName')} />
                    <Field label="Telefone" value={draft.guardianPhone} onChange={v => update('guardianPhone', v)} flagged={isFlag('guardianPhone')} />
                    <div className="col-span-2">
                      <Field label="E-mail" value={draft.guardianEmail} onChange={v => update('guardianEmail', v)} flagged={isFlag('guardianEmail')} />
                    </div>
                  </div>
                </PreviewCard>

                {/* Dados Escolares */}
                <PreviewCard>
                  <SectionHeader title="Dados Escolares" />
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Escola" value={draft.schoolName} onChange={v => update('schoolName', v)} flagged={isFlag('schoolName')} />
                    <Field label="Série / Ano" value={draft.grade} onChange={v => update('grade', v)} flagged={isFlag('grade')} />
                    <Field label="Turno" value={draft.shift} onChange={v => update('shift', v)} hint="Manhã / Tarde / Integral" flagged={isFlag('shift')} />
                    <Field label="Professor Regente" value={draft.regentTeacher} onChange={v => update('regentTeacher', v)} flagged={isFlag('regentTeacher')} />
                    <Field label="Professor AEE" value={draft.aeeTeacher} onChange={v => update('aeeTeacher', v)} flagged={isFlag('aeeTeacher')} />
                    <Field label="Coordenação" value={draft.coordinator} onChange={v => update('coordinator', v)} flagged={isFlag('coordinator')} />
                  </div>
                </PreviewCard>

                {/* Dados Clínicos */}
                <PreviewCard>
                  <SectionHeader title="Diagnóstico e Saúde" />
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <Field label="Diagnóstico(s) — um por linha" value={draft.diagnosis} onChange={v => update('diagnosis', v)} multiline flagged={isFlag('diagnosis')} hint="Ex: TEA Nível 1&#10;TDAH" />
                    </div>
                    <Field label="CID" value={draft.cid} onChange={v => update('cid', v)} hint="Ex: F84.0" flagged={isFlag('cid')} />
                    <Field label="Nível de Suporte" value={draft.supportLevel} onChange={v => update('supportLevel', v)} hint="Leve / Moderado / Intensivo" flagged={isFlag('supportLevel')} />
                    <div className="col-span-2">
                      <Field label="Medicação" value={draft.medication} onChange={v => update('medication', v)} flagged={isFlag('medication')} />
                    </div>
                  </div>
                </PreviewCard>

                {/* Perfil Pedagógico */}
                <PreviewCard>
                  <SectionHeader title="Perfil Pedagógico" />
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Habilidades / Potencialidades — uma por linha" value={draft.abilities} onChange={v => update('abilities', v)} multiline flagged={isFlag('abilities')} />
                    <Field label="Dificuldades / Barreiras — uma por linha" value={draft.difficulties} onChange={v => update('difficulties', v)} multiline flagged={isFlag('difficulties')} />
                    <Field label="Formas de Comunicação — uma por linha" value={draft.communication} onChange={v => update('communication', v)} multiline flagged={isFlag('communication')} />
                    <Field label="Estratégias Pedagógicas — uma por linha" value={draft.strategies} onChange={v => update('strategies', v)} multiline flagged={isFlag('strategies')} />
                  </div>
                </PreviewCard>

                {/* Contexto e Observações */}
                <PreviewCard>
                  <SectionHeader title="Contexto e Observações" />
                  <div className="flex flex-col gap-3">
                    <Field label="Histórico Escolar" value={draft.schoolHistory} onChange={v => update('schoolHistory', v)} multiline flagged={isFlag('schoolHistory')} />
                    <Field label="Contexto Familiar" value={draft.familyContext} onChange={v => update('familyContext', v)} multiline flagged={isFlag('familyContext')} />
                    <Field label="Observações Pedagógicas" value={draft.observations} onChange={v => update('observations', v)} multiline flagged={isFlag('observations')} />
                    <div>
                      <Field label="Recomendações" value={draft.recommendations} onChange={v => update('recommendations', v)} multiline flagged={isFlag('recommendations')} />
                      <p className="text-[11px] mt-1" style={{ color: C.textSec }}>
                        Será salvo junto com as Observações Pedagógicas.
                      </p>
                    </div>
                  </div>
                </PreviewCard>

                {parseError && (
                  <div className="flex items-start gap-2 p-3 rounded-xl text-sm"
                       style={{ background: C.redLight, color: C.red }}>
                    <AlertCircle size={15} className="mt-0.5 shrink-0" /> {parseError}
                  </div>
                )}
              </div>
            );
          })()}

          {/* ══════════════════════════════════════════════════════════════
              STEP: DONE
          ══════════════════════════════════════════════════════════════ */}
          {step === 'done' && (
            <div className="p-6 flex flex-col gap-5">
              {/* CSV result */}
              {importMode === 'csv' && result && (
                <>
                  <div className="flex flex-col items-center gap-3 pt-2">
                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                         style={{ background: C.greenLight }}>
                      <CheckCircle size={32} style={{ color: C.green }} />
                    </div>
                    <div className="text-center">
                      <h3 className="text-lg font-bold" style={{ color: C.dark }}>
                        {result.importedRows} aluno(s) importado(s) com sucesso!
                      </h3>
                      <p className="text-sm mt-1" style={{ color: C.textSec }}>
                        Arquivo: {file?.name ?? 'importacao.csv'}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-xl p-3 text-center"
                         style={{ background: C.greenLight, border: `1px solid ${C.green}30` }}>
                      <p className="text-2xl font-extrabold" style={{ color: C.green }}>{result.completeRows}</p>
                      <p className="text-xs mt-0.5" style={{ color: C.green }}>Completos</p>
                    </div>
                    <div className="rounded-xl p-3 text-center"
                         style={{ background: C.amberLight, border: `1px solid ${C.amber}30` }}>
                      <p className="text-2xl font-extrabold" style={{ color: C.amber }}>{result.incompleteRows}</p>
                      <p className="text-xs mt-0.5" style={{ color: C.amber }}>Incompletos</p>
                    </div>
                    <div className="rounded-xl p-3 text-center"
                         style={{ background: C.redLight, border: `1px solid ${C.red}30` }}>
                      <p className="text-2xl font-extrabold" style={{ color: C.red }}>{result.preRegRows}</p>
                      <p className="text-xs mt-0.5" style={{ color: C.red }}>Pré-cadastros</p>
                    </div>
                  </div>
                  {result.errors.length > 0 && (
                    <div className="rounded-xl overflow-hidden border" style={{ borderColor: C.border }}>
                      <div className="px-4 py-2.5 text-xs font-semibold flex items-center gap-2"
                           style={{ background: C.bg, color: C.dark, borderBottom: `1px solid ${C.border}` }}>
                        <AlertTriangle size={13} style={{ color: C.amber }} />
                        {result.errors.length} linha(s) com erro (não importadas)
                      </div>
                      <div className="divide-y" style={{ borderColor: C.border }}>
                        {result.errors.slice(0, 5).map(err => (
                          <div key={err.rowIndex} className="px-4 py-2 text-xs flex gap-3" style={{ color: C.text }}>
                            <span style={{ color: C.textSec }}>Linha {err.rowIndex}</span>
                            {err.name && <strong>{err.name}</strong>}
                            <span style={{ color: C.red }}>{err.error}</span>
                          </div>
                        ))}
                        {result.errors.length > 5 && (
                          <div className="px-4 py-2 text-xs" style={{ color: C.textSec }}>
                            … e mais {result.errors.length - 5} erro(s)
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* DOCX result */}
              {importMode === 'docx' && docxSaveResult && (
                <>
                  <div className="flex flex-col items-center gap-3 pt-2">
                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                         style={{ background: docxSaveResult.saved > 0 ? C.greenLight : C.redLight }}>
                      {docxSaveResult.saved > 0
                        ? <CheckCircle size={32} style={{ color: C.green }} />
                        : <AlertCircle size={32} style={{ color: C.red }} />
                      }
                    </div>
                    <div className="text-center">
                      <h3 className="text-lg font-bold" style={{ color: C.dark }}>
                        {docxSaveResult.saved > 0
                          ? `${docxSaveResult.saved} aluno(s) importado(s) com sucesso!`
                          : 'Nenhum aluno foi importado'
                        }
                      </h3>
                      <p className="text-sm mt-1" style={{ color: C.textSec }}>
                        Arquivo: {file?.name}
                      </p>
                    </div>
                  </div>
                  {docxSaveResult.saved > 0 && (
                    <div className="flex items-start gap-2 p-3 rounded-xl text-xs"
                         style={{ background: '#EEF4F7', color: C.petrol }}>
                      <Info size={13} className="mt-0.5 shrink-0" />
                      Cadastro criado. Você poderá complementar as informações e anexar laudos ou relatórios no perfil do aluno.
                    </div>
                  )}
                  {docxSaveResult.errors.length > 0 && (
                    <div className="rounded-xl overflow-hidden border" style={{ borderColor: C.border }}>
                      <div className="px-4 py-2.5 text-xs font-semibold flex items-center gap-2"
                           style={{ background: C.bg, color: C.dark, borderBottom: `1px solid ${C.border}` }}>
                        <AlertTriangle size={13} style={{ color: C.amber }} />
                        {docxSaveResult.errors.length} erro(s) ao salvar
                      </div>
                      <div className="divide-y" style={{ borderColor: C.border }}>
                        {docxSaveResult.errors.map((err, i) => (
                          <div key={i} className="px-4 py-2 text-xs" style={{ color: C.red }}>{err}</div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <div
          className="flex items-center justify-between gap-3 px-6 py-4 border-t shrink-0"
          style={{ borderColor: C.border, background: C.bg }}
        >
          {/* Esquerda */}
          <div>
            {step === 'preview' && (
              <button
                onClick={() => { setStep('upload'); setParsed(null); setFile(null); setParseError(null); }}
                className="text-sm font-medium transition hover:opacity-70"
                style={{ color: C.textSec }}
              >
                ← Trocar arquivo
              </button>
            )}
            {step === 'ai_preview' && (
              <button
                onClick={() => {
                  // Nota de crédito: a análise que já foi entregue nesta
                  // revisão já foi cobrada definitivamente — trocar de
                  // arquivo agora NÃO devolve esse valor (regra de negócio de
                  // 26/08/2026). Uma nova análise, se a professora processar
                  // outro arquivo, é uma cobrança nova e independente, com o
                  // mesmo painel de confirmação de custo de sempre.
                  setStep('upload');
                  setDocxDrafts([]);
                  setFile(null);
                  setParseError(null);
                  setDuplicateCandidates([]);
                  setFileReady(false);
                  setImportFileType(null);
                  setPendingExtractedText(null);
                  setPendingPdfPageInfo(null);
                  setDocxPageDisclosure(null);
                  setDocxTruncationNotice(null);
                  setCreditsCharged(null);
                }}
                className="text-sm font-medium transition hover:opacity-70"
                style={{ color: C.textSec }}
              >
                ← Trocar arquivo
              </button>
            )}
          </div>

          {/* Direita */}
          <div className="flex gap-3">
            {step === 'upload' && (
              <button
                onClick={handleClose}
                className="px-4 py-2 rounded-xl text-sm font-semibold transition hover:opacity-80"
                style={{ background: C.border, color: C.dark }}
              >
                Cancelar
              </button>
            )}

            {step === 'preview' && previewCounts && (
              <>
                <button
                  onClick={handleClose}
                  className="px-4 py-2 rounded-xl text-sm font-semibold transition hover:opacity-80"
                  style={{ background: C.border, color: C.dark }}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCSVImport}
                  disabled={previewCounts.total === 0}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold text-white transition hover:opacity-85 disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ background: C.petrol, boxShadow: '0 4px 12px rgba(31,78,95,0.22)' }}
                >
                  <Users size={15} />
                  Importar {previewCounts.total} aluno(s)
                  <ArrowRight size={15} />
                </button>
              </>
            )}

            {step === 'ai_preview' && (
              <>
                <button
                  onClick={handleClose}
                  className="px-4 py-2 rounded-xl text-sm font-semibold transition hover:opacity-80"
                  style={{ background: C.border, color: C.dark }}
                >
                  Cancelar
                </button>
                <button
                  onClick={() => handleDocxSave()}
                  disabled={docxIsSaving || !docxDrafts.some(d => d.name.trim())}
                  title={!docxIsSaving && !docxDrafts.some(d => d.name.trim()) ? 'Preencha o nome do aluno para poder salvar' : undefined}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold text-white transition hover:opacity-85 disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ background: C.gold, boxShadow: '0 4px 12px rgba(198,146,20,0.25)' }}
                >
                  {docxIsSaving
                    ? <><Loader2 size={15} className="animate-spin" /> Salvando…</>
                    : <><CheckCircle size={15} /> Confirmar e salvar {docxDrafts.length} aluno(s)</>
                  }
                </button>
              </>
            )}

            {step === 'done' && (
              <button
                onClick={() => {
                  const count = importMode === 'docx'
                    ? (docxSaveResult?.saved ?? 0)
                    : (result?.importedRows ?? 0);
                  onImportComplete(count);
                  onClose();
                }}
                className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold text-white transition hover:opacity-85"
                style={{ background: C.petrol, boxShadow: '0 4px 12px rgba(31,78,95,0.22)' }}
              >
                <CheckCircle size={15} />
                Ver alunos importados
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudentImportModal;
