// AEE PDF and print share the approved HTML preview. Word/Docs retain their adapters.
// Regente exports are unchanged.
import React, { useCallback } from 'react';
import type { ActionPlanJSON, AEEActionPlanJSON, SchoolConfig, Student, User } from '../../types';
import { generateDocumentCodeFromSeed } from '../../utils/documentCodes';
import { DocumentExportActions } from '../document-workspace/DocumentExportActions';
import { useFormalDocumentExport } from '../document-workspace/useFormalDocumentExport';
import {
  actionPlanRegenteToSections, actionPlanRegenteTitle,
  actionPlanAeeToSections, actionPlanAeeTitle,
} from '../../services/documentModel/actionPlan';

export interface PlanoAcaoExportRowProps {
  variant: 'regente' | 'aee';
  plan: ActionPlanJSON | AEEActionPlanJSON;
  student: Student;
  user?: User;
  school?: SchoolConfig | null;
  onPrint?: () => void;
  className?: string;
}

export const PlanoAcaoExportRow: React.FC<PlanoAcaoExportRowProps> = ({
  variant, plan, student, user, school, onPrint, className,
}) => {
  const getSections = useCallback(
    () => variant === 'aee'
      ? actionPlanAeeToSections(plan as AEEActionPlanJSON)
      : actionPlanRegenteToSections(plan as ActionPlanJSON),
    [variant, plan],
  );
  const reg = (plan as any).registrationNumber || '';
  const auditCode = /^(REG|VAL)-\d{8}/.test(reg)
    ? reg
    : generateDocumentCodeFromSeed('registration', (plan as any).generatedAt || new Date(), `plano:${variant}:${reg || student.id}`);

  const exportActions = useFormalDocumentExport({
    docLabel: variant === 'aee' ? 'Plano de Acao AEE' : 'Plano de Acao Regente',
    title: variant === 'aee' ? actionPlanAeeTitle() : actionPlanRegenteTitle(),
    student,
    user,
    school: school ?? null,
    auditCode,
    getSections,
    pdfFromSections: true,
    onPrint,
    isolationKey: `plano:${variant}:${student.id}:${reg}`,
  });

  return <div>
    <DocumentExportActions {...exportActions}
      {...(variant === 'aee' ? { onDownloadPdf: onPrint ?? (() => { throw new Error('Pré-visualização AEE indisponível'); }) } : {})}
      className={className} />
    {variant === 'aee' && <p className="text-xs text-gray-500 mt-1">Para salvar o PDF, escolha “Salvar como PDF” na janela de impressão.</p>}
  </div>;
};

export default PlanoAcaoExportRow;
