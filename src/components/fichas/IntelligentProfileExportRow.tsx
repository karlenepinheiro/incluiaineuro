// components/fichas/IntelligentProfileExportRow.tsx
// [FASE 2 · BLOCO B] Exportação do Perfil Inteligente — exporta a VERSÃO
// selecionada (o chamador passa o record atual). PDF = renderer dedicado
// existente; Word + Google Docs = adaptador do MESMO profile_json.

import React, { useCallback } from 'react';
import type { SchoolConfig, Student, User } from '../../types';
import type { IntelligentProfileRecord } from '../../services/intelligentProfileService';
import { generateDocumentCodeFromSeed } from '../../utils/documentCodes';
import { DocumentExportActions } from '../document-workspace/DocumentExportActions';
import { useFormalDocumentExport } from '../document-workspace/useFormalDocumentExport';
import {
  intelligentProfileToSections, intelligentProfileTitle,
} from '../../services/documentModel/intelligentProfile';

export interface IntelligentProfileExportRowProps {
  record: IntelligentProfileRecord;
  student: Student;
  user?: User;
  school?: SchoolConfig | null;
  /** Handler de PDF já existente (generateIntelligentProfilePDF da versão atual). */
  onDownloadPdf: () => void | Promise<void>;
  isDownloadingPdf?: boolean;
  className?: string;
}

export const IntelligentProfileExportRow: React.FC<IntelligentProfileExportRowProps> = ({
  record, student, user, school, onDownloadPdf, isDownloadingPdf, className,
}) => {
  const getSections = useCallback(
    () => intelligentProfileToSections(record.profile_json),
    [record.profile_json],
  );
  const auditCode = generateDocumentCodeFromSeed(
    'registration', record.created_at, `perfil-int:${record.id}:${record.version_number}`,
  );

  const exportActions = useFormalDocumentExport({
    docLabel: `Perfil Inteligente V${record.version_number}`,
    title: intelligentProfileTitle(record.version_number),
    student,
    user,
    school: school ?? null,
    auditCode,
    getSections,
    onDownloadPdf,
    // troca de versão ⇒ isolationKey muda ⇒ estado do Google Docs reseta
    isolationKey: `perfil-int:${student.id}:${record.id}:${record.version_number}`,
  });

  return <DocumentExportActions {...exportActions} isDownloadingPdf={isDownloadingPdf ?? exportActions.isDownloadingPdf} className={className} />;
};

export default IntelligentProfileExportRow;
