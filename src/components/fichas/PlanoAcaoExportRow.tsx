// components/fichas/PlanoAcaoExportRow.tsx
// [FASE 2 · BLOCO B] Exportação dos Planos de Ação (Regente e AEE) —
// PDF canônico (generateFromSections) + Word + Google Docs, TODOS a partir do
// mesmo adaptador. Substitui a dependência de impressão de innerHTML para o
// "Baixar PDF". "Imprimir" (HTML) segue separado, na tela.
//
// Regente e AEE são documentos DISTINTOS: o adaptador respeita a ordem e os
// blocos próprios de cada um (ver documentModel/actionPlan.ts).

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

  return <DocumentExportActions {...exportActions} className={className} />;
};

export default PlanoAcaoExportRow;
