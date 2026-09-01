// components/fichas/ServiceRecordExportRow.tsx
// [FASE 2 · BLOCO B] Linha de exportação de um Registro de Atendimento.

import React, { useCallback } from 'react';
import type { SchoolConfig, ServiceRecord, Student, User } from '../../types';
import {
  generateDocumentCodeFromSeed,
} from '../../utils/documentCodes';
import { DocumentExportActions } from '../document-workspace/DocumentExportActions';
import { useFormalDocumentExport } from '../document-workspace/useFormalDocumentExport';
import { serviceRecordToSections, serviceRecordTitle } from '../../services/documentModel/serviceRecord';

export interface ServiceRecordExportRowProps {
  record: ServiceRecord;
  student: Student;
  user?: User;
  school?: SchoolConfig | null;
  className?: string;
}

export const ServiceRecordExportRow: React.FC<ServiceRecordExportRowProps> = ({
  record, student, user, school, className,
}) => {
  const getSections = useCallback(() => serviceRecordToSections(record), [record]);
  const auditCode = generateDocumentCodeFromSeed('registration', record.date || record.createdAt || new Date(), `atendimento:${record.id}`);

  const exportActions = useFormalDocumentExport({
    docLabel: 'Registro de Atendimento',
    title: serviceRecordTitle(),
    student,
    user,
    school: school ?? null,
    auditCode,
    getSections,
    pdfFromSections: true,
    isolationKey: `atendimento:${record.id}`,
  });

  return <DocumentExportActions {...exportActions} className={className} />;
};

export default ServiceRecordExportRow;
