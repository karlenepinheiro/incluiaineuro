// components/fichas/EvolutionExportRow.tsx
// ─────────────────────────────────────────────────────────────────────────────
// [FASE 2] Linha de exportação (PDF + Word + Google Docs) do Relatório Evolutivo
// (ReportsView). Componente separado para o hook rodar só com aluno válido.

import React, { useCallback } from 'react';
import type { DocField, SchoolConfig, Student, User } from '../../types';
import { DocumentExportActions } from '../document-workspace/DocumentExportActions';
import { useFormalDocumentExport } from '../document-workspace/useFormalDocumentExport';
import {
  relatorioEvolucaoToSections,
  relatorioEvolucaoTitle,
} from '../../services/documentModel/relatorioEvolucao';

export interface EvolutionExportRowProps {
  student: Student;
  user?: User;
  school?: SchoolConfig | null;
  scores: number[];
  observation: string;
  criteria: Array<{ name: string; desc?: string }>;
  customFields?: DocField[];
  history?: Array<{ date?: string; createdAt?: string; scores?: number[] }>;
  auditCode?: string | null;
  isolationKey: string;
  /** Handler de PDF já existente (ExportService.exportEvolutionReportPDF). */
  onDownloadPdf: () => void | Promise<void>;
  onPrint?: () => void;
  className?: string;
}

export const EvolutionExportRow: React.FC<EvolutionExportRowProps> = ({
  student, user, school, scores, observation, criteria, customFields, history,
  auditCode, isolationKey, onDownloadPdf, onPrint, className,
}) => {
  const getSections = useCallback(
    () => relatorioEvolucaoToSections({ scores, observation, criteria, customFields, history }),
    [scores, observation, criteria, customFields, history],
  );

  const exportActions = useFormalDocumentExport({
    docLabel: 'Relatorio Evolutivo',
    title: relatorioEvolucaoTitle(),
    student,
    user,
    school: school ?? null,
    auditCode,
    getSections,
    onDownloadPdf,
    onPrint,
    isolationKey,
  });

  return <DocumentExportActions {...exportActions} className={className} />;
};

export default EvolutionExportRow;
