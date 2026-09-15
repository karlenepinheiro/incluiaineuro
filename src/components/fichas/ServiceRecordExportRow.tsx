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
  compact?: boolean;
  onEdit?: () => void;
}

export const ServiceRecordExportRow: React.FC<ServiceRecordExportRowProps> = ({
  record, student, user, school, className, compact, onEdit,
}) => {
  const getSections = useCallback(() => serviceRecordToSections(record), [record]);
  const auditCode = generateDocumentCodeFromSeed('registration', record.date || record.createdAt || new Date(), `atendimento:${record.id}`);

  const exportActions = useFormalDocumentExport({
    docLabel: 'Registro de Atendimento',
    title: serviceRecordTitle(),
    student,
    user: { ...user, name: record.professional } as User,
    school: school ?? null,
    auditCode,
    getSections,
    pdfFromSections: true,
    compactServiceRecord: true,
    isolationKey: `atendimento:${record.id}`,
  });

  if (compact) return <div className="flex items-center gap-2 whitespace-nowrap">
    <button onClick={onEdit} className="p-1.5 text-gray-500 hover:text-brand-600 hover:bg-brand-50 rounded">Editar</button>
    <span className="text-gray-300">|</span>
    <button onClick={exportActions.onDownloadPdf} disabled={exportActions.isDownloadingPdf}
      className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded">{exportActions.isDownloadingPdf ? 'Gerando…' : 'PDF'}</button>
    <span className="text-gray-300">|</span>
    <button onClick={exportActions.onDownloadWord} disabled={exportActions.isDownloadingWord}
      className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded">{exportActions.isDownloadingWord ? 'Gerando…' : 'Word'}</button>
  </div>;
  return <DocumentExportActions {...exportActions} className={className} />;
};

export default ServiceRecordExportRow;
