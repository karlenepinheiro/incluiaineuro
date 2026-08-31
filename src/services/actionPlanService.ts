/**
 * actionPlanService.ts
 *
 * CRUD para a tabela `student_action_plans` (schema_v28_action_plans.sql).
 * Cada plano é uma nova linha — nunca sobrescreve versões anteriores.
 * O register_code e o version_number são gerados automaticamente por triggers
 * no banco; o frontend não precisa calculá-los.
 */

import { supabase } from './supabase';
import { ActionPlanJSON, ActionPlanRecord, ActionPlanPeriod, ActionPlanBlock } from '../types';

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

/**
 * Reidrata um `ActionPlanBlock` a partir de um valor persistido em `content_json`.
 * Aceita tanto o formato antigo (só o array de items) quanto o novo ({ title, items }).
 * Retorna `undefined` quando não houver dado — assim os blocos opcionais continuam
 * opcionais para a UI (`if (plan.focusPlan)`), sem virar bloco vazio fantasma.
 */
function hydrateBlock(raw: any, fallbackTitle: string): ActionPlanBlock | undefined {
  if (raw == null) return undefined;
  const items = Array.isArray(raw) ? raw : Array.isArray(raw.items) ? raw.items : [];
  const title = (!Array.isArray(raw) && typeof raw.title === 'string' && raw.title.trim())
    ? raw.title
    : fallbackTitle;
  if (items.length === 0) return undefined;
  return { title, items };
}

/** Serializa um `ActionPlanBlock` para `content_json` preservando título e items. */
function serializeBlock(block: ActionPlanBlock | undefined): { title: string; items: any[] } | undefined {
  if (!block) return undefined;
  const items = Array.isArray(block.items) ? block.items : [];
  if (items.length === 0) return undefined;
  return { title: block.title ?? '', items };
}

export function rowToRecord(row: any): ActionPlanRecord {
  const period: ActionPlanPeriod = DB_TO_PERIOD[row.plan_type] ?? 'mensal';
  const cj = row.content_json ?? {};

  // Reconstrói ActionPlanJSON a partir das colunas estruturadas da tabela.
  // Blocos obrigatórios (compat. com planos antigos): sempre presentes.
  // Blocos/campos enriquecidos: só quando houver dado persistido.
  const planJson: ActionPlanJSON = {
    period,
    generatedAt:        row.generated_at ?? row.created_at,
    generatedBy:        row.generated_by ?? '',
    generatedByName:    row.generated_by_name ?? '',
    registrationNumber: row.register_code ?? '',
    version:            row.version_number ?? 1,
    beforeClass:        { title: 'Antes da Aula',                           items: cj.before_class           ?? [] },
    duringClass:        { title: 'Durante a Aula',                          items: cj.during_class            ?? [] },
    activitiesStrategies: { title: 'Atividades e Estratégias',              items: cj.activities_strategies   ?? [] },
    assessment:         { title: 'Avaliação',                               items: cj.assessment               ?? [] },
    attentionObservations: { title: 'Atenção e Observações',                items: cj.attention_observations   ?? [] },
    communicationTeam:  { title: 'Comunicação com AEE / Coordenação / Família', items: cj.communication       ?? [] },
  };

  // Campos enriquecidos (opcionais) — reidratados apenas quando existirem.
  if (typeof cj.practical_objective === 'string' && cj.practical_objective.trim()) {
    planJson.practicalObjective = cj.practical_objective;
  }
  if (typeof cj.next_step === 'string' && cj.next_step.trim()) {
    planJson.nextStep = cj.next_step;
  }
  const focusPlan          = hydrateBlock(cj.focus_plan,          'Foco do Plano');
  const mainBarrier        = hydrateBlock(cj.main_barrier,        'Barreira Principal em Sala');
  const suggestedGames     = hydrateBlock(cj.suggested_games,     'Jogos Sugeridos');
  const suggestedVideos    = hydrateBlock(cj.suggested_videos,    'Vídeos Sugeridos');
  const suggestedMaterials = hydrateBlock(cj.suggested_materials, 'Materiais Sugeridos');
  const suggestedDynamics  = hydrateBlock(cj.suggested_dynamics,  'Dinâmicas Sugeridas');
  const adaptations        = hydrateBlock(cj.adaptations,         'Adaptações da Atividade');
  const evidenceRecording  = hydrateBlock(cj.evidence_recording,  'Como Registrar Evidências');
  const studentResponse    = hydrateBlock(cj.student_response,    'Resposta do Aluno');
  if (focusPlan)          planJson.focusPlan          = focusPlan;
  if (mainBarrier)        planJson.mainBarrier        = mainBarrier;
  if (suggestedGames)     planJson.suggestedGames     = suggestedGames;
  if (suggestedVideos)    planJson.suggestedVideos    = suggestedVideos;
  if (suggestedMaterials) planJson.suggestedMaterials = suggestedMaterials;
  if (suggestedDynamics)  planJson.suggestedDynamics  = suggestedDynamics;
  if (adaptations)        planJson.adaptations        = adaptations;
  if (evidenceRecording)  planJson.evidenceRecording  = evidenceRecording;
  if (studentResponse)    planJson.studentResponse    = studentResponse;

  return {
    id:         row.id,
    student_id: row.student_id,
    tenant_id:  row.tenant_id,
    plan_json:  planJson,
    created_at: row.created_at,
  };
}

// ─── Mapeamento ActionPlanJSON → content_json (estrutura do banco) ───────────

export function planJsonToContentJson(plan: ActionPlanJSON) {
  const cj: Record<string, any> = {
    before_class:            plan.beforeClass?.items          ?? [],
    during_class:            plan.duringClass?.items          ?? [],
    activities_strategies:   plan.activitiesStrategies?.items ?? [],
    assessment:              plan.assessment?.items           ?? [],
    attention_observations:  plan.attentionObservations?.items ?? [],
    communication:           plan.communicationTeam?.items    ?? [],
  };

  // Campos enriquecidos — persistidos quando presentes (a coluna content_json é
  // jsonb livre; nenhuma migration é necessária). Blocos vazios são omitidos
  // para manter o JSON enxuto e não recriar blocos fantasmas na reabertura.
  if (typeof plan.practicalObjective === 'string' && plan.practicalObjective.trim()) {
    cj.practical_objective = plan.practicalObjective.trim();
  }
  if (typeof plan.nextStep === 'string' && plan.nextStep.trim()) {
    cj.next_step = plan.nextStep.trim();
  }
  const enriched: Array<[string, ActionPlanBlock | undefined]> = [
    ['focus_plan',          plan.focusPlan],
    ['main_barrier',        plan.mainBarrier],
    ['suggested_games',     plan.suggestedGames],
    ['suggested_videos',    plan.suggestedVideos],
    ['suggested_materials', plan.suggestedMaterials],
    ['suggested_dynamics',  plan.suggestedDynamics],
    ['adaptations',         plan.adaptations],
    ['evidence_recording',  plan.evidenceRecording],
    ['student_response',    plan.studentResponse],
  ];
  for (const [key, block] of enriched) {
    const serialized = serializeBlock(block);
    if (serialized) cj[key] = serialized;
  }

  return cj;
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
      credits_consumed:      sourceSnapshot.creditsConsumed  ?? 6,
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
