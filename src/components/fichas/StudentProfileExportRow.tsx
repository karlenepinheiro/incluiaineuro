// components/fichas/StudentProfileExportRow.tsx
// [FASE 2 · BLOCO B] Exportação do Perfil do Aluno (dossiê) — PDF (renderer
// dedicado existente, com o MESMO config) + Word + Google Docs (adaptador).

import React, { useCallback } from 'react';
import type { SchoolConfig, Student, User } from '../../types';
import { ExportService } from '../../services/exportService';
import { generateDocumentCodeFromSeed } from '../../utils/documentCodes';
import { DocumentExportActions } from '../document-workspace/DocumentExportActions';
import { useFormalDocumentExport } from '../document-workspace/useFormalDocumentExport';
import {
  studentProfileToSections, studentProfileTitle,
  type StudentProfileConfig, type StudentProfileExtra,
} from '../../services/documentModel/studentProfile';

export interface StudentProfileExportRowProps {
  student: Student;
  user?: User;
  school?: SchoolConfig | null;
  config?: StudentProfileConfig;
  extra?: StudentProfileExtra;
  emittedBy?: string;
  className?: string;
}

export const StudentProfileExportRow: React.FC<StudentProfileExportRowProps> = ({
  student, user, school, config, extra, emittedBy, className,
}) => {
  const getSections = useCallback(
    () => studentProfileToSections(student, { config, extra }),
    [student, config, extra],
  );
  const auditCode = generateDocumentCodeFromSeed('registration', new Date(), `dossie:${student.id}`);

  const onDownloadPdf = useCallback(async () => {
    await ExportService.generateStudentProfilePDF(
      student, emittedBy || user?.name || 'Sistema', school ?? null, config as any, extra as any,
    );
  }, [student, emittedBy, user, school, config, extra]);

  const exportActions = useFormalDocumentExport({
    docLabel: 'Perfil do Aluno',
    title: studentProfileTitle(),
    student,
    user,
    school: school ?? null,
    auditCode,
    getSections,
    onDownloadPdf,
    isolationKey: `dossie:${student.id}`,
  });

  return <DocumentExportActions {...exportActions} className={className} />;
};

export default StudentProfileExportRow;
