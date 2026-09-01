// services/documentModel/actionPlan.ts
// [FASE 2 · BLOCO B] Adaptadores dos Planos de Ação → DocSection[].
//
// Dois documentos DISTINTOS que compartilham o shape de bloco
// ({ title, items: [{text, done}] }) mas têm blocos e ordem DIFERENTES:
//   - Plano de Ação do Professor Regente (ActionPlanJSON)
//   - Plano de Ação do AEE (AEEActionPlanJSON)
//
// A ordem de blocos segue a do PrintModal de cada aba (fonte da verdade atual).
// NÃO altera prompt nem resposta da IA — só reorganiza o mesmo conteúdo.

import type { ActionPlanBlock, ActionPlanJSON, AEEActionPlanJSON, DocSection } from '../../types';
import {
  buildSections, kvField, listField, proseField, resetFieldSeq, section,
} from './sectionBuilders';

function blockToSection(block: ActionPlanBlock | undefined | null): DocSection | null {
  if (!block) return null;
  const items = (block.items ?? [])
    .filter(i => (i?.text ?? '').trim())
    .map(i => (i.done ? `✔ ${i.text.trim()}` : i.text.trim()));
  const title = block.title || 'Bloco';
  return items.length
    ? section(title, [listField('blk', '', items)])
    : section(title, [proseField('blk', '', '')]); // vazio → "Não informado"
}

// ─── Plano de Ação do Professor Regente ──────────────────────────────────────

/** Ordem canônica (PrintModal de ActionPlanTab). */
export const ACTION_PLAN_REGENTE_BLOCK_ORDER = [
  'focusPlan', 'mainBarrier',
  'beforeClass', 'duringClass', 'activitiesStrategies', 'assessment', 'attentionObservations', 'communicationTeam',
  'suggestedGames', 'suggestedVideos', 'suggestedMaterials', 'suggestedDynamics',
  'adaptations', 'evidenceRecording',
  'studentResponse',
] as const;

export function actionPlanRegenteTitle(): string {
  return 'Plano de Ação — Professor Regente';
}

export function actionPlanRegenteToSections(plan: ActionPlanJSON): DocSection[] {
  resetFieldSeq();
  return buildSections([
    section('Identificação do Plano', [
      kvField('id', 'Período', String(plan.period ?? '')),
      kvField('id', 'Nº de Registro', plan.registrationNumber),
      kvField('id', 'Versão', plan.version != null ? String(plan.version) : ''),
      kvField('id', 'Gerado por', plan.generatedByName || plan.generatedBy),
      kvField('id', 'Gerado em', plan.generatedAt ? new Date(plan.generatedAt).toLocaleString('pt-BR') : ''),
    ]),
    plan.practicalObjective
      ? section('Objetivo Prático do Período', [proseField('op', '', plan.practicalObjective)])
      : null,
    ...ACTION_PLAN_REGENTE_BLOCK_ORDER.map(k => blockToSection((plan as any)[k])),
    plan.nextStep ? section('Próximo Passo', [proseField('np', '', plan.nextStep)]) : null,
  ]);
}

// ─── Plano de Ação do AEE ────────────────────────────────────────────────────

/** Ordem canônica (PrintModal de AEEActionPlanTab). */
export const ACTION_PLAN_AEE_BLOCK_ORDER = [
  'welcomeRoutine', 'priorityBarrier',
  'sessionScript',
  'gamesResources', 'videosResources', 'printedActivities', 'digitalResources', 'dynamicsResources',
  'materials', 'applicationGuide', 'adaptationsGuide',
  'responseRecord',
] as const;

export function actionPlanAeeTitle(): string {
  return 'Plano de Ação — Atendimento Educacional Especializado (AEE)';
}

export function actionPlanAeeToSections(plan: AEEActionPlanJSON): DocSection[] {
  resetFieldSeq();
  return buildSections([
    section('Identificação do Plano', [
      kvField('id', 'Período', String(plan.period ?? '')),
      kvField('id', 'Nº de Registro', plan.registrationNumber),
      kvField('id', 'Versão', plan.version != null ? String(plan.version) : ''),
      kvField('id', 'Gerado por', plan.generatedByName || plan.generatedBy),
      kvField('id', 'Gerado em', plan.generatedAt ? new Date(plan.generatedAt).toLocaleString('pt-BR') : ''),
    ]),
    plan.sessionObjective
      ? section('Objetivo da Sessão', [proseField('so', '', plan.sessionObjective)])
      : null,
    ...ACTION_PLAN_AEE_BLOCK_ORDER.map(k => blockToSection((plan as any)[k])),
    plan.nextStep ? section('Próximo Passo', [proseField('np', '', plan.nextStep)]) : null,
  ]);
}
