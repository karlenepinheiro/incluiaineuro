/**
 * aeeActionPlanService.ts
 *
 * CRUD para a tabela `student_aee_action_plans`.
 * Cada plano AEE é uma nova linha — nunca sobrescreve versões anteriores.
 * register_code e version_number são gerados automaticamente por triggers no banco.
 */

import { supabase } from './supabase';
import { AEEActionPlanJSON, AEEActionPlanRecord, AEEActionPlanPeriod, ActionPlanBlock } from '../types';

const PERIOD_TO_DB: Record<AEEActionPlanPeriod, string> = {
  semanal:   'weekly',
  quinzenal: 'biweekly',
  mensal:    'monthly',
  bimestral: 'bimonthly',
  semestral: 'semiannual',
};

const DB_TO_PERIOD: Record<string, AEEActionPlanPeriod> = {
  weekly:     'semanal',
  biweekly:   'quinzenal',
  monthly:    'mensal',
  bimonthly:  'bimestral',
  semiannual: 'semestral',
};

const SELECT_COLS = `
  id,
  student_id,
  tenant_id,
  generated_by,
  generated_by_name,
  plan_type,
  title,
  content_json,
  source_snapshot,
  register_code,
  version_number,
  is_archived,
  generated_at,
  created_at,
  updated_at
`.trim();

function emptyBlock(title: string): ActionPlanBlock {
  return { title, items: [] };
}

export function rowToRecord(row: any): AEEActionPlanRecord {
  const period: AEEActionPlanPeriod = DB_TO_PERIOD[row.plan_type] ?? 'mensal';
  const cj = row.content_json ?? {};

  const planJson: AEEActionPlanJSON = {
    period,
    generatedAt:        row.generated_at ?? row.created_at,
    generatedBy:        row.generated_by ?? '',
    generatedByName:    row.generated_by_name ?? '',
    registrationNumber: row.register_code ?? '',
    version:            row.version_number ?? 1,
    sessionObjective:   cj.session_objective ?? undefined,
    nextStep:           cj.next_step ?? undefined,
    welcomeRoutine:     { title: 'Acolhida e Rotina do AEE',       items: cj.welcome_routine     ?? [] },
    priorityBarrier:    { title: 'Barreira Prioritária',            items: cj.priority_barrier    ?? [] },
    sessionScript:      { title: 'Roteiro do Atendimento',          items: cj.session_script      ?? [] },
    materials:          { title: 'Materiais Necessários',           items: cj.materials           ?? [] },
    applicationGuide:   { title: 'Como Aplicar',                    items: cj.application_guide   ?? [] },
    responseRecord:     { title: 'Como Registrar a Resposta',       items: cj.response_record     ?? [] },
    gamesResources:     cj.games_resources     ? { title: 'Jogos Sugeridos',                      items: cj.games_resources }     : undefined,
    videosResources:    cj.videos_resources    ? { title: 'Vídeos Sugeridos',                     items: cj.videos_resources }    : undefined,
    printedActivities:  cj.printed_activities  ? { title: 'Atividades Impressas Sugeridas',        items: cj.printed_activities }  : undefined,
    digitalResources:   cj.digital_resources   ? { title: 'Atividade/Jogo no Computador',          items: cj.digital_resources }   : undefined,
    dynamicsResources:  cj.dynamics_resources  ? { title: 'Dinâmicas Sugeridas',                   items: cj.dynamics_resources }  : undefined,
    adaptationsGuide:   cj.adaptations_guide   ? { title: 'Como Adaptar',                          items: cj.adaptations_guide }   : undefined,
  };

  return {
    id:         row.id,
    student_id: row.student_id,
    tenant_id:  row.tenant_id,
    plan_json:  planJson,
    created_at: row.created_at,
  };
}

export function planJsonToContentJson(plan: AEEActionPlanJSON) {
  const cj: Record<string, any> = {
    session_objective:  plan.sessionObjective ?? null,
    next_step:          plan.nextStep         ?? null,
    welcome_routine:    plan.welcomeRoutine?.items    ?? [],
    priority_barrier:   plan.priorityBarrier?.items   ?? [],
    session_script:     plan.sessionScript?.items     ?? [],
    materials:          plan.materials?.items         ?? [],
    application_guide:  plan.applicationGuide?.items  ?? [],
    response_record:    plan.responseRecord?.items    ?? [],
  };
  if (plan.gamesResources)    cj.games_resources    = plan.gamesResources.items;
  if (plan.videosResources)   cj.videos_resources   = plan.videosResources.items;
  if (plan.printedActivities) cj.printed_activities = plan.printedActivities.items;
  if (plan.digitalResources)  cj.digital_resources  = plan.digitalResources.items;
  if (plan.dynamicsResources) cj.dynamics_resources = plan.dynamicsResources.items;
  if (plan.adaptationsGuide)  cj.adaptations_guide  = plan.adaptationsGuide.items;
  return cj;
}

export const AEEActionPlanService = {

  async listByStudent(studentId: string): Promise<AEEActionPlanRecord[]> {
    const { data, error } = await supabase
      .from('student_aee_action_plans')
      .select(SELECT_COLS)
      .eq('student_id', studentId)
      .eq('is_archived', false)
      .order('generated_at', { ascending: false });

    if (error) throw error;
    return (data ?? []).map(rowToRecord);
  },

  async save(params: {
    studentId:      string;
    tenantId:       string;
    createdBy:      string;
    createdByName?: string;
    planJson:       AEEActionPlanJSON;
    sourceSnapshot?: {
      paeeId?:              string | null;
      estudoDeCasoId?:      string | null;
      peiId?:               string | null;
      creditsConsumed?:     number;
      geminiModel?:         string;
    };
  }): Promise<{ id: string; registerCode: string; versionNumber: number }> {
    const { studentId, tenantId, createdBy, createdByName, planJson, sourceSnapshot } = params;

    const periodLabels: Record<AEEActionPlanPeriod, string> = {
      semanal: 'Semanal', quinzenal: 'Quinzenal', mensal: 'Mensal',
      bimestral: 'Bimestral', semestral: 'Semestral',
    };
    const title       = `Plano AEE ${periodLabels[planJson.period] ?? 'Mensal'} — ${new Date().toLocaleDateString('pt-BR')}`;
    const planTypeDb  = PERIOD_TO_DB[planJson.period] ?? 'monthly';
    const contentJson = planJsonToContentJson(planJson);

    const sourceSnapshotDb = sourceSnapshot ? {
      paee_id:           sourceSnapshot.paeeId            ?? null,
      estudo_de_caso_id: sourceSnapshot.estudoDeCasoId   ?? null,
      pei_id:            sourceSnapshot.peiId            ?? null,
      credits_consumed:  sourceSnapshot.creditsConsumed  ?? 7,
      gemini_model:      sourceSnapshot.geminiModel       ?? 'gemini-2.5-flash',
      generated_at:      new Date().toISOString(),
    } : null;

    const { data, error } = await supabase
      .from('student_aee_action_plans')
      .insert({
        student_id:        studentId,
        tenant_id:         tenantId,
        generated_by:      createdBy,
        generated_by_name: createdByName ?? planJson.generatedByName ?? null,
        plan_type:         planTypeDb,
        title,
        content_json:      contentJson,
        source_snapshot:   sourceSnapshotDb,
      })
      .select('id, register_code, version_number')
      .single();

    if (error) throw error;

    return {
      id:            data.id,
      registerCode:  data.register_code,
      versionNumber: data.version_number,
    };
  },

  async archive(id: string): Promise<boolean> {
    const { error } = await supabase
      .from('student_aee_action_plans')
      .update({ is_archived: true })
      .eq('id', id);
    return !error;
  },
};
