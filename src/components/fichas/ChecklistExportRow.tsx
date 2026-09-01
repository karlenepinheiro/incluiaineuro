// components/fichas/ChecklistExportRow.tsx
// [FASE 2 · BLOCO B] Exportação dos checklists de observação (documentos finais):
//   - Regente / Observação de Sala
//   - Cuidadora
// PDF canônico (generateFromSections) + Word + Google Docs, do mesmo adaptador.
// "Imprimir" (HTML atual) segue separado.

import React, { useCallback } from 'react';
import type { SchoolConfig, Student, User } from '../../types';
import { generateDocumentCodeFromSeed } from '../../utils/documentCodes';
import { DocumentExportActions } from '../document-workspace/DocumentExportActions';
import { useFormalDocumentExport } from '../document-workspace/useFormalDocumentExport';
import {
  checklistToSections,
  CHECKLIST_REGENTE_HEADER, CHECKLIST_REGENTE_SECTION_KEYS, checklistRegenteTitle,
  CHECKLIST_CUIDADORA_HEADER, CHECKLIST_CUIDADORA_SECTION_KEYS, checklistCuidadoraTitle,
} from '../../services/documentModel/checklist';

// Rótulos de seção — pt-BR, sem os prefixos numéricos da tela.
const REGENTE_LABELS: Record<string, string> = {
  atencaoParticipacao: 'Atenção e Participação',
  comunicacao: 'Comunicação',
  interacaoSocial: 'Interação Social',
  autonomia: 'Autonomia',
  aprendizagem: 'Aprendizagem',
  regulacaoComportamento: 'Comportamento e Regulação',
  estrategiasEficazes: 'Estratégias Eficazes',
  recomendacoesImediatas: 'Recomendações Imediatas',
};
const CUIDADORA_LABELS: Record<string, string> = {
  chegadaEscola: 'Chegada à Escola',
  alimentacao: 'Alimentação',
  higieneBanheiro: 'Higiene e Banheiro',
  deslocamentoSeguranca: 'Deslocamento e Segurança',
  comunicacaoNecessidades: 'Comunicação de Necessidades',
  regulacaoEmocional: 'Regulação Emocional',
  interacaoSocial: 'Interação Social',
  transicoesRotina: 'Transições de Rotina',
  estrategiasEficazes: 'Estratégias que Funcionaram',
  alertasSemana: 'Alertas da Semana',
};

export interface ChecklistExportRowProps {
  variant: 'regente' | 'cuidadora';
  data: Record<string, any>;
  student: Student;
  user?: User;
  school?: SchoolConfig | null;
  auditCode?: string | null;
  onPrint?: () => void;
  className?: string;
}

export const ChecklistExportRow: React.FC<ChecklistExportRowProps> = ({
  variant, data, student, user, school, auditCode, onPrint, className,
}) => {
  const isRegente = variant === 'regente';
  const getSections = useCallback(() => checklistToSections({
    title: isRegente ? checklistRegenteTitle() : checklistCuidadoraTitle(),
    data,
    headerFields: isRegente ? CHECKLIST_REGENTE_HEADER : CHECKLIST_CUIDADORA_HEADER,
    sections: (isRegente ? CHECKLIST_REGENTE_SECTION_KEYS : CHECKLIST_CUIDADORA_SECTION_KEYS)
      .map(id => ({ id, label: (isRegente ? REGENTE_LABELS : CUIDADORA_LABELS)[id] ?? id })),
    contextKey: isRegente ? 'contextoObservado' : undefined,
    contextLabel: 'Contexto Observado',
  }), [isRegente, data]);

  const code = auditCode && /^(REG|VAL)-/.test(auditCode)
    ? auditCode
    : generateDocumentCodeFromSeed('registration', new Date(), `checklist:${variant}:${student.id}:${auditCode ?? ''}`);

  const exportActions = useFormalDocumentExport({
    docLabel: isRegente ? 'Checklist Regente' : 'Checklist Cuidadora',
    title: isRegente ? checklistRegenteTitle() : checklistCuidadoraTitle(),
    student,
    user,
    school: school ?? null,
    auditCode: code,
    getSections,
    pdfFromSections: true,
    onPrint,
    isolationKey: `checklist:${variant}:${student.id}:${auditCode ?? ''}`,
  });

  return <DocumentExportActions {...exportActions} className={className} />;
};

export default ChecklistExportRow;
