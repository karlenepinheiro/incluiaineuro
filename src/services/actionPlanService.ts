/**
 * actionPlanService.ts
 *
 * CRUD para a tabela `student_action_plans` (schema_v28_action_plans.sql).
 * Cada plano é uma nova linha — nunca sobrescreve versões anteriores.
 * O register_code e o version_number são gerados automaticamente por triggers
 * no banco; o frontend não precisa calculá-los.
 */

import { supabase } from './supabase';
import { ActionPlanJSON, ActionPlanRecord, ActionPlanPeriod } from '../types';

// Mapeamento frontend (pt-BR) → banco (en)
const PERIOD_TO_DB: Record<ActionPlanPeriod, string> = {
  semanal:   'weekly',
  mensal:    'monthly',
  bimestral: 'bimonthly',
  macro:     'macro',
};

// Mapeamento banco (en) → frontend (pt-BR)
const DB_TO_PERIOD: Record<string, ActionPlanPeriod> = {
  weekly:    'semanal',
  monthly:   'mensal',
  bimonthly: 'bimestral',
  macro:     'macro',
};

// Colunas selecionadas em todas as queries de leitura
const SELECT_COLS = `
  id,
  student_id,
  tenant_id,
  generated_by,
  generated_by_name,
  plan_type,
  title,
  summary,
  content_json,
  source_snapshot,
  register_code,
  version_number,
  is_archived,
  generated_at,
  created_at,
  updated_at
`.trim();

// ─── Mapeamento row → ActionPlanRecord ──────────────────────────────────────

function rowToRecord(row: any): ActionPlanRecord {
  const period: ActionPlanPeriod = DB_TO_PERIOD[row.plan_type] ?? 'mensal';

  // Reconstrói ActionPlanJSON a partir das colunas estruturadas da tabela
  const planJson: ActionPlanJSON = {
    period,
    generatedAt:        row.generated_at ?? row.created_at,
    generatedBy:        row.generated_by ?? '',
    generatedByName:    row.generated_by_name ?? '',
    registrationNumber: row.register_code ?? '',
    version:            row.version_number ?? 1,
    beforeClass:        { title: 'Antes da Aula',                           items: row.content_json?.before_class           ?? [] },
    duringClass:        { title: 'Durante a Aula',                          items: row.content_json?.during_class            ?? [] },
    activitiesStrategies: { title: 'Atividades e Estratégias',              items: row.content_json?.activities_strategies   ?? [] },
    assessment:         { title: 'Avaliação',                               items: row.content_json?.assessment               ?? [] },
    attentionObservations: { title: 'Atenção e Observações',                items: row.content_json?.attention_observations   ?? [] },
    communicationTeam:  { title: 'Comunicação com AEE / Coordenação / Família', items: row.content_json?.communication       ?? [] },
  };

  return {
    id:         row.id,
    student_id: row.student_id,
    tenant_id:  row.tenant_id,
    plan_json:  planJson,
    created_at: row.created_at,
  };
}

// ─── Mapeamento ActionPlanJSON → content_json (estrutura do banco) ───────────

function planJsonToContentJson(plan: ActionPlanJSON) {
  return {
    before_class:            plan.beforeClass?.items          ?? [],
    during_class:            plan.duringClass?.items          ?? [],
    activities_strategies:   plan.activitiesStrategies?.items ?? [],
    assessment:              plan.assessment?.items           ?? [],
    attention_observations:  plan.attentionObservations?.items ?? [],
    communication:           plan.communicationTeam?.items    ?? [],
  };
}

// ─── Service ─────────────────────────────────────────────────────────────────

export const ActionPlanService = {

  /** Lista planos de um aluno, mais recente primeiro. Exclui arquivados. */
  async listByStudent(studentId: string): Promise<ActionPlanRecord[]> {
    const { data, error } = await supabase
      .from('student_action_plans')
      .select(SELECT_COLS)
      .eq('student_id', studentId)
      .eq('is_archived', false)
      .order('generated_at', { ascending: false });

    if (error) throw error;
    return (data ?? []).map(rowToRecord);
  },

  /** Lista planos de um aluno incluindo arquivados (para histórico completo). */
  async listByStudentFull(studentId: string): Promise<ActionPlanRecord[]> {
    const { data, error } = await supabase
      .from('student_action_plans')
      .select(SELECT_COLS)
      .eq('student_id', studentId)
      .order('generated_at', { ascending: false });

    if (error) throw error;
    return (data ?? []).map(rowToRecord);
  },

  /**
   * Salva um novo plano de ação.
   * O banco cuida de: register_code (trigger), version_number (trigger),
   * created_at, updated_at e generated_at (DEFAULT now()).
   */
  async save(params: {
    studentId:     string;
    tenantId:      string;
    createdBy:     string;
    createdByName?: string;
    planJson:      ActionPlanJSON;
    sourceSnapshot?: {
      estudoDeCasoId?:    string | null;
      peiId?:             string | null;
      perfilInteligenteId?: string | null;
      laudosIds?:         string[];
      creditsConsumed?:   number;
      geminiModel?:       string;
    };
  }): Promise<{ id: string; registerCode: string; versionNumber: number }> {
    const { studentId, tenantId, createdBy, createdByName, planJson, sourceSnapshot } = params;

    const periodLabel =
      planJson.period === 'semanal'   ? 'Semanal'   :
      planJson.period === 'mensal'    ? 'Mensal'     :
      planJson.period === 'bimestral' ? 'Bimestral'  : 'Macro';

    const contentJson    = planJsonToContentJson(planJson);
    const planTypeDb     = PERIOD_TO_DB[planJson.period] ?? 'monthly';
    const title          = `Plano ${periodLabel} — ${new Date().toLocaleDateString('pt-BR')}`;

    const sourceSnapshotDb = sourceSnapshot ? {
      estudo_de_caso_id:     sourceSnapshot.estudoDeCasoId   ?? null,
      pei_id:                sourceSnapshot.peiId            ?? null,
      perfil_inteligente_id: sourceSnapshot.perfilInteligenteId ?? null,
      laudos_ids:            sourceSnapshot.laudosIds         ?? [],
      credits_consumed:      sourceSnapshot.creditsConsumed  ?? 8,
      gemini_model:          sourceSnapshot.geminiModel       ?? 'gemini-2.5-flash',
      generated_at:          new Date().toISOString(),
    } : null;

    const { data, error } = await supabase
      .from('student_action_plans')
      .insert({
        student_id:        studentId,
        tenant_id:         tenantId,
        generated_by:      createdBy,
        generated_by_name: createdByName ?? planJson.generatedByName ?? null,
        plan_type:         planTypeDb,
        title,
        summary:           null,
        content_json:      contentJson,
        source_snapshot:   sourceSnapshotDb,
        // register_code e version_number são preenchidos pelos triggers do banco
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

  /** Arquiva um plano (soft delete). Preferível ao delete físico. */
  async archive(id: string): Promise<boolean> {
    const { error } = await supabase
      .from('student_action_plans')
      .update({ is_archived: true })
      .eq('id', id);

    return !error;
  },

  /** Delete físico — use apenas para correção de dados ou admin. */
  async delete(id: string): Promise<boolean> {
    const { error } = await supabase
      .from('student_action_plans')
      .delete()
      .eq('id', id);

    return !error;
  },

  /** Busca um plano pelo register_code (registro interno, sem validação externa). */
  async findByRegisterCode(code: string): Promise<ActionPlanRecord | null> {
    const { data, error } = await supabase
      .from('student_action_plans')
      .select(SELECT_COLS)
      .eq('register_code', code)
      .maybeSingle();

    if (error || !data) return null;
    return rowToRecord(data);
  },

  /** Retorna o próximo número de versão para um aluno (consulta ao banco). */
  async nextVersionNumber(studentId: string): Promise<number> {
    const { data } = await supabase
      .rpc('next_action_plan_version', { p_student_id: studentId });

    return (data as number | null) ?? 1;
  },
};
