// services/documentModel/quickDoc.ts
// ─────────────────────────────────────────────────────────────────────────────
// [FASE 2] Adaptador do QuickDocModal (documentos rápidos a partir da ficha):
//   - encaminhamento_redes  → Encaminhamento para a Rede de Apoio
//   - convite_reuniao       → Convite para Reunião
//   - termo_desligamento    → Termo de Desligamento do AEE
//
// A ordem das seções segue a do PDF canônico (PDFGenerator.generate).

import type { DocSection } from '../../types';
import {
  buildSections,
  kvField,
  proseField,
  resetFieldSeq,
  section,
} from './sectionBuilders';

export type QuickDocType = 'encaminhamento_redes' | 'convite_reuniao' | 'termo_desligamento';

const TITLES: Record<QuickDocType, string> = {
  encaminhamento_redes: 'Encaminhamento para a Rede de Apoio',
  convite_reuniao: 'Convite para Reunião',
  termo_desligamento: 'Termo de Desligamento do AEE',
};

export function quickDocTitle(docType: QuickDocType): string {
  return TITLES[docType] ?? 'Documento';
}

export function quickDocToSections(
  docType: QuickDocType,
  filledData: Record<string, string>,
  ctx: { studentName: string; schoolName?: string | null } = { studentName: '' },
): DocSection[] {
  resetFieldSeq();
  const f = (k: string) => filledData[k] ?? '';

  if (docType === 'encaminhamento_redes') {
    return buildSections([
      section('Identificação do Encaminhamento', [
        kvField('enc', 'Responsável Legal', f('responsavel')),
        kvField('enc', 'Data', f('data')),
        kvField('enc', 'Setor / Serviço de Destino', [f('setor'), f('servico')].filter(Boolean).join(' — ')),
        kvField('enc', 'Motivo do Encaminhamento', f('motivo_opcao')),
      ]),
      section('Justificativa do Encaminhamento', [
        proseField('just', '', f('motivo'), { optional: true }),
      ]),
      section('Orientações ao Serviço Receptor', [
        proseField('orient', '', f('observacoes'), { optional: true }),
      ]),
    ]);
  }

  if (docType === 'convite_reuniao') {
    return buildSections([
      section('Dados da Convocação', [
        kvField('conv', 'Data e Horário', f('data_horario')),
        kvField('conv', 'Local', f('local') || ctx.schoolName || ''),
        kvField('conv', 'Profissional Responsável', f('profissional')),
      ]),
      section('Pauta e Objetivo da Reunião', [
        proseField('pauta', '', f('pauta') || 'Acompanhamento pedagógico do(a) aluno(a).'),
      ]),
    ]);
  }

  // termo_desligamento
  return buildSections([
    section('Dados do Período de Atendimento', [
      kvField('desl', 'Primeiro Atendimento', f('primeiro_dia_atendimento')),
      kvField('desl', 'Último Atendimento', f('ultimo_dia_atendimento')),
      kvField('desl', 'Motivo do Desligamento', f('motivo_opcao')),
      kvField('desl', 'Data de Emissão', f('data')),
    ]),
    section('Detalhamento do Motivo', [
      proseField('motivo_c', '', f('motivo_complemento'), { optional: true }),
    ]),
    section('Síntese da Evolução Pedagógica', [
      proseField('evol', '', f('evolucao')),
    ]),
    section('Recomendações Finais', [
      proseField('recs', '', f('recomendacoes'), { optional: true }),
    ]),
  ]);
}
