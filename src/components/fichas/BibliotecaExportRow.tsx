// components/fichas/BibliotecaExportRow.tsx
// [FASE 2 · BLOCO B] Exportação de um item da Biblioteca (documento salvo).
// Usa SEMPRE o `structured_data` da versão salva. Encaminha para o renderer
// canônico de seções (o mesmo OOXML da Fase 1) — PDF + Word + Google Docs.
//   - atividade do IncluiLAB → NÃO exporta aqui (usa o exportador do IncluiLAB).
//
// PDF e Word saem das MESMAS seções da versão salva → nunca dados atuais,
// nunca mistura de aluno/documento (isolationKey inclui id + audit_code).

import React, { useCallback } from 'react';
import type { SchoolConfig, Student, User } from '../../types';
import { generateDocumentCodeFromSeed } from '../../utils/documentCodes';
import { DocumentExportActions } from '../document-workspace/DocumentExportActions';
import { useFormalDocumentExport } from '../document-workspace/useFormalDocumentExport';
import { routeBibliotecaItem, type BibliotecaItemLike } from '../../services/documentModel/biblioteca';

export interface BibliotecaExportRowProps {
  item: BibliotecaItemLike;
  student: Student;
  user?: User;
  school?: SchoolConfig | null;
  className?: string;
}

export const BibliotecaExportRow: React.FC<BibliotecaExportRowProps> = ({
  item, student, user, school, className,
}) => {
  const route = routeBibliotecaItem(item);
  const auditCode = item.audit_code
    || generateDocumentCodeFromSeed('registration', item.created_at || new Date(), `biblioteca:${route.docLabel}:${student.id}`);

  const getSections = useCallback(() => route.sections, [route.sections]);

  const exportActions = useFormalDocumentExport({
    docLabel: route.docLabel,
    title: route.title,
    student,
    user,
    school: school ?? null,
    auditCode,
    getSections,
    pdfFromSections: true,
    disabled: route.isIncluiLabActivity || route.sections.length === 0,
    isolationKey: `biblioteca:${item.doc_type ?? item.type}:${student.id}:${auditCode}`,
  });

  if (route.isIncluiLabActivity) {
    return (
      <p className={`text-[11px] text-gray-400 ${className ?? ''}`}>
        Atividade do IncluiLAB — exporte pelo próprio IncluiLAB.
      </p>
    );
  }

  if (route.sections.length === 0) {
    return (
      <p className={`text-[11px] text-amber-600 ${className ?? ''}`}>
        Este documento salvo não tem conteúdo estruturado suficiente para exportação.
      </p>
    );
  }

  return <DocumentExportActions {...exportActions} className={className} />;
};

export default BibliotecaExportRow;
