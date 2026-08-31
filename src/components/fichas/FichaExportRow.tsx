// components/fichas/FichaExportRow.tsx
// ─────────────────────────────────────────────────────────────────────────────
// [FASE 2] Linha de exportação (PDF + Word + Google Docs) para uma ficha da
// FichasComplementaresView. É um componente separado só porque a lista de
// fichas é renderizada em `.map()` — e hooks não podem ser chamados em loop.
//
// PDF: reaproveita o handler existente da tela (PDFGenerator.generateFicha).
// Word/Google Docs: mesmo Blob canônico via adaptador fichaToSections.

import React, { useCallback } from 'react';
import type { SchoolConfig, Student, User } from '../../types';
import { DocumentExportActions } from '../document-workspace/DocumentExportActions';
import { useFormalDocumentExport } from '../document-workspace/useFormalDocumentExport';
import { fichaToSections, type FichaExportField } from '../../services/documentModel/ficha';

export interface FichaExportRowProps {
  fichaId: string;
  fichaTitle: string;
  fields: FichaExportField[];
  student: Student;
  user?: User;
  school?: SchoolConfig | null;
  auditCode?: string | null;
  /** Handler de PDF já existente na tela (gera + baixa via PDFGenerator.generateFicha). */
  onDownloadPdf: () => void | Promise<void>;
  className?: string;
}

export const FichaExportRow: React.FC<FichaExportRowProps> = ({
  fichaId, fichaTitle, fields, student, user, school, auditCode, onDownloadPdf, className,
}) => {
  const getSections = useCallback(
    () => fichaToSections(fichaTitle, fields),
    [fichaTitle, fields],
  );

  const exportActions = useFormalDocumentExport({
    docLabel: fichaTitle,
    title: fichaTitle,
    student,
    user,
    school: school ?? null,
    auditCode,
    getSections,
    onDownloadPdf,
    isolationKey: `ficha:${fichaId}:${student.id}:${auditCode ?? ''}`,
  });

  return <DocumentExportActions {...exportActions} className={className} />;
};

export default FichaExportRow;
