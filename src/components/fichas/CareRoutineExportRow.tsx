// components/fichas/CareRoutineExportRow.tsx
// [FASE 2 · BLOCO B] Exportação da Rotina da Cuidadora (antes sem nenhuma
// exportação): PDF canônico + Word + Google Docs, do adaptador careRoutine.

import React, { useCallback } from 'react';
import type { SchoolConfig, Student, User } from '../../types';
import type { CareSection } from '../../services/careRoutineService';
import { generateDocumentCodeFromSeed } from '../../utils/documentCodes';
import { DocumentExportActions } from '../document-workspace/DocumentExportActions';
import { useFormalDocumentExport } from '../document-workspace/useFormalDocumentExport';
import { careRoutineToSections, careRoutineTitle } from '../../services/documentModel/careRoutine';

export interface CareRoutineExportRowProps {
  sections: CareSection[];
  student: Student;
  user?: User;
  school?: SchoolConfig | null;
  className?: string;
}

export const CareRoutineExportRow: React.FC<CareRoutineExportRowProps> = ({
  sections, student, user, school, className,
}) => {
  const getSections = useCallback(() => careRoutineToSections(sections), [sections]);
  const auditCode = generateDocumentCodeFromSeed('registration', new Date(), `rotina-cuidadora:${student.id}`);

  const exportActions = useFormalDocumentExport({
    docLabel: 'Rotina da Cuidadora',
    title: careRoutineTitle(),
    student,
    user,
    school: school ?? null,
    auditCode,
    getSections,
    pdfFromSections: true,
    isolationKey: `rotina-cuidadora:${student.id}`,
  });

  return <DocumentExportActions {...exportActions} className={className} />;
};

export default CareRoutineExportRow;
