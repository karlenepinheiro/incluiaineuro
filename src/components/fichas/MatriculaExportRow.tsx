// components/fichas/MatriculaExportRow.tsx
// [FASE 2 · BLOCO B] Exportação de um documento de matrícula (PDF já gerado +
// Word + Google Docs a partir do mesmo conteúdo canônico).

import React, { useCallback } from 'react';
import type { SchoolConfig, Student, User } from '../../types';
import { PDFGenerator } from '../../services/PDFGenerator';
import { generateDocumentCodeFromSeed } from '../../utils/documentCodes';
import { DocumentExportActions } from '../document-workspace/DocumentExportActions';
import { useFormalDocumentExport } from '../document-workspace/useFormalDocumentExport';
import {
  matriculaToSections, matriculaTitle, matriculaDocLabel, type MatriculaTipo,
} from '../../services/documentModel/matricula';

export interface MatriculaExportRowProps {
  tipo: MatriculaTipo;
  student: Student;
  user?: User;
  school?: SchoolConfig | null;
  /** Blob de PDF já gerado pelo wizard (evita regenerar). Se ausente, gera sob demanda. */
  pdfBlob?: Blob;
  pdfFilename: string;
  className?: string;
}

export const MatriculaExportRow: React.FC<MatriculaExportRowProps> = ({
  tipo, student, user, school, pdfBlob, pdfFilename, className,
}) => {
  const getSections = useCallback(() => matriculaToSections(tipo, student, school ?? null), [tipo, student, school]);
  const auditCode = generateDocumentCodeFromSeed('registration', new Date(), `matricula:${tipo}:${student.id}`);

  const onDownloadPdf = useCallback(async () => {
    const blob = pdfBlob ?? await PDFGenerator.generateMatriculaDoc(
      (tipo === 'declaracao_matricula_srm' ? 'declaracao_matricula_srm'
        : tipo === 'declaracao_compromisso' ? 'declaracao_compromisso' : 'termo_aee'),
      student, (user ?? { name: 'IncluiAI' }) as User, school ?? null,
    );
    PDFGenerator.download(blob, pdfFilename);
  }, [pdfBlob, tipo, student, user, school, pdfFilename]);

  const exportActions = useFormalDocumentExport({
    docLabel: matriculaDocLabel(tipo),
    title: matriculaTitle(tipo),
    student,
    user,
    school: school ?? null,
    auditCode,
    getSections,
    onDownloadPdf,
    isolationKey: `matricula:${tipo}:${student.id}`,
  });

  return <DocumentExportActions {...exportActions} className={className} />;
};

export default MatriculaExportRow;
