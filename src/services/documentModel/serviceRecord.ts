// services/documentModel/serviceRecord.ts
// [FASE 2 · BLOCO B] Adaptador: Registro de Atendimento (ServiceRecord) → DocSection[].
// Mapeia TODOS os campos do ServiceRecord + ServiceDailyChecklist. Sem IA.

import type { DocSection, ServiceRecord } from '../../types';
import {
  buildSections, gridField, kvField, proseField, resetFieldSeq, scaleField, section,
} from './sectionBuilders';

const COMPORTAMENTO_LABEL: Record<string, string> = {
  adequado: 'Adequado',
  regular: 'Regular',
  necessita_suporte: 'Necessita suporte',
};

export function serviceRecordTitle(): string {
  return 'Registro de Atendimento Especializado';
}

export function serviceRecordToSections(record: ServiceRecord): DocSection[] {
  resetFieldSeq();
  const c = record.dailyChecklist;
  const dateStr = record.date ? new Date(record.date).toLocaleDateString('pt-BR') : '';
  const createdStr = record.createdAt ? new Date(record.createdAt).toLocaleString('pt-BR') : '';

  return buildSections([
    section('Dados do Atendimento', [
      kvField('at', 'Data do Atendimento', dateStr),
      kvField('at', 'Tipo de Atendimento', record.type),
      kvField('at', 'Profissional Responsável', record.professional),
      kvField('at', 'Duração (minutos)', record.duration != null ? String(record.duration) : ''),
      kvField('at', 'Presença', record.attendance),
      ...(createdStr ? [kvField('at', 'Registrado em', createdStr)] : []),
    ]),

    section('Observações do Atendimento', [
      proseField('obs', '', record.observation),
    ]),

    c && section('Ficha Avaliativa Diária', [
      scaleField('fa', 'Desempenho na atividade', c.desempenho, 8),
      scaleField('fa', 'Interação com pares/profissional', c.interacao, 8),
      kvField('fa', 'Comportamento geral', COMPORTAMENTO_LABEL[c.comportamento] ?? c.comportamento),
    ]),

    c && section('Progresso e Estratégias do Dia', [
      proseField('pe', 'Progresso na atividade', c.progressoAtividade),
      proseField('pe', 'Estratégias que funcionaram', c.estrategiasUsadas),
      proseField('pe', 'Próximos passos / encaminhamentos', c.proximosPassos),
    ]),
  ]);
}

/** Lista explícita dos campos que o adaptador DEVE cobrir (usada pelo teste anti-regressão). */
export const SERVICE_RECORD_FIELD_KEYS = [
  'date', 'type', 'professional', 'duration', 'attendance', 'createdAt', 'observation',
  'dailyChecklist.desempenho', 'dailyChecklist.interacao', 'dailyChecklist.comportamento',
  'dailyChecklist.progressoAtividade', 'dailyChecklist.estrategiasUsadas', 'dailyChecklist.proximosPassos',
] as const;
