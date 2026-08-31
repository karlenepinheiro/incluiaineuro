// components/document-workspace/useFormalDocumentExport.ts
// ─────────────────────────────────────────────────────────────────────────────
// [FASE 2] "Cola" entre um documento formal da Fase 2 e a linha
// <DocumentExportActions>. Cada tela chama este hook com:
//   - um adaptador `getSections()` que converte os dados ATUAIS em DocSection[];
//   - o handler de PDF que a tela já tem (jsPDF canônico existente);
//   - identificação do documento/aluno.
// e recebe de volta as props prontas para <DocumentExportActions>.
//
// Word (.docx) = exportGenericDocumentToWord(getSections())  → download OU Drive.
// Google Docs  = EXATAMENTE o mesmo Blob (nunca regenerado, nunca IA).

import { useCallback, useMemo, useState } from 'react';
import type { DocSection, SchoolConfig, Student, User } from '../../types';
import {
  buildGenericWordFilename,
  downloadWordDocument,
  exportGenericDocumentToWord,
} from '../../services/wordExportService';
import { buildGoogleDocsDisplayName } from '../../services/googleDriveExportService';
import { GOOGLE_DOCS_EXPORT_ENABLED } from '../../config/googleDriveConfig';
import { PDFGenerator } from '../../services/PDFGenerator';
import { useGoogleDocsExport } from './useGoogleDocsExport';
import type { DocumentExportActionsProps } from './DocumentExportActions';

export interface UseFormalDocumentExportParams {
  /** Rótulo curto/legível do documento (ex.: "Relatório Técnico", "Escuta da Família"). */
  docLabel: string;
  /** Título institucional impresso no topo do Word (ex.: "Relatório Técnico Pedagógico"). */
  title: string;
  student: Student;
  user?: User;
  school?: SchoolConfig | null;
  auditCode?: string | null;
  /** Converte os dados ATUAIS do documento na tela em seções canônicas. */
  getSections: () => DocSection[];
  /**
   * PDF: OU um handler já existente na tela (jsPDF canônico dedicado),
   * OU `{ pdfFromSections: true }` para o hook gerar o PDF a partir das MESMAS
   * `getSections()` via PDFGenerator.generateFromSections (garante PDF e Word
   * com o mesmo conteúdo e a mesma ordem). Exatamente um dos dois.
   */
  onDownloadPdf?: () => void | Promise<void>;
  pdfFromSections?: boolean;
  /** Handler de impressão (opcional). */
  onPrint?: () => void;
  /**
   * Chave de isolamento (além de aluno+tipo). Passe algo que mude quando o
   * usuário troca de aluno OU de documento OU abre outra versão da biblioteca.
   */
  isolationKey: string;
  /** Força desligar o Word/Google Docs (ex.: documento em estado que bloqueia exportação). */
  disabled?: boolean;
}

export function useFormalDocumentExport(params: UseFormalDocumentExportParams): DocumentExportActionsProps {
  const {
    docLabel, title, student, user, school, auditCode,
    getSections, onDownloadPdf, pdfFromSections = false, onPrint, isolationKey, disabled = false,
  } = params;

  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [isDownloadingWord, setIsDownloadingWord] = useState(false);

  const downloadPdfFromSections = useCallback(async () => {
    const sections = getSections();
    const blob = await PDFGenerator.generateFromSections({
      docType: docLabel,
      title,
      student,
      user: (user ?? { name: 'IncluiAI' }) as User,
      school: school ?? null,
      sections: sections.map(s => ({
        title: s.title,
        fields: s.fields.map(f => ({ label: f.label, value: f.value, type: f.type, maxScale: f.maxScale })),
      })),
      auditCode: auditCode ?? '',
    });
    PDFGenerator.download(blob, `${buildGenericWordFilename(docLabel, student, auditCode).replace(/\.docx$/, '')}.pdf`);
  }, [getSections, docLabel, title, student, user, school, auditCode]);

  const effectiveOnDownloadPdf = pdfFromSections ? downloadPdfFromSections : onDownloadPdf;

  const generateDocxBlob = useCallback(async (): Promise<Blob> => {
    const sections = getSections();
    return exportGenericDocumentToWord({
      title,
      data: { sections },
      student,
      user,
      school: school ?? null,
      auditCode: auditCode ?? null,
    });
  }, [getSections, title, student, user, school, auditCode]);

  const displayName = useMemo(
    () => buildGoogleDocsDisplayName(docLabel, student?.name ?? 'Aluno', auditCode ?? undefined),
    [docLabel, student?.name, auditCode],
  );

  // Assinatura leve do conteúdo (para detectar edição após exportar).
  const contentSignature = useMemo(() => {
    try {
      return JSON.stringify(getSections());
    } catch {
      return `${isolationKey}:${auditCode ?? ''}`;
    }
  }, [getSections, isolationKey, auditCode]);

  const gdocsEnabled = GOOGLE_DOCS_EXPORT_ENABLED && !disabled;

  const gdocs = useGoogleDocsExport({
    generateDocxBlob,
    displayName,
    contentSignature,
    isolationKey,
    enabled: gdocsEnabled,
  });

  const handleDownloadPdf = useCallback(async () => {
    if (isDownloadingPdf || !effectiveOnDownloadPdf) return;
    setIsDownloadingPdf(true);
    try {
      await effectiveOnDownloadPdf();
    } catch (e: any) {
      if (typeof window !== 'undefined') {
        window.alert(`Erro ao gerar PDF: ${e?.message || 'Tente novamente.'}`);
      }
    } finally {
      setIsDownloadingPdf(false);
    }
  }, [isDownloadingPdf, effectiveOnDownloadPdf]);

  const handleDownloadWord = useCallback(async () => {
    if (isDownloadingWord) return;
    setIsDownloadingWord(true);
    try {
      const blob = await generateDocxBlob();
      downloadWordDocument(blob, buildGenericWordFilename(docLabel, student, auditCode));
    } catch (e: any) {
      if (typeof window !== 'undefined') {
        window.alert(`Erro ao exportar Word: ${e?.message || 'Tente novamente.'}`);
      }
    } finally {
      setIsDownloadingWord(false);
    }
  }, [isDownloadingWord, generateDocxBlob, docLabel, student, auditCode]);

  return {
    onDownloadPdf: () => { void handleDownloadPdf(); },
    isDownloadingPdf,
    onDownloadWord: disabled ? undefined : () => { void handleDownloadWord(); },
    isDownloadingWord,
    onOpenGoogleDocs: gdocs.onOpenGoogleDocs,
    googleDocsStatus: gdocs.status,
    googleDocsMessage: gdocs.message,
    googleDocsFallbackUrl: gdocs.fallbackUrl,
    onPrint,
  };
}
