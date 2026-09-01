/**
 * intelligentProfileService.ts
 * CRUD para a tabela student_intelligent_profiles.
 */

import { supabase } from './supabase';

export interface ChecklistItem {
  label: string;
  status: 'presente' | 'em_desenvolvimento' | 'nao_observado';
}

export interface RecommendedActivity {
  title: string;
  objective: string;
  howToApply: string;
  whyItHelps: string;
  supportLevel: 'Baixo' | 'Médio' | 'Alto';
  incluiLabPrompt: string;
}

export interface ChallengeItem {
  title: string;
  description: string;
}

export interface IntelligentProfileJSON {
  studentName: string;
  generatedAt: string;
  generatedBy: string;
  version: number;
  /** Carta em 1ª pessoa do aluno para o professor (novo em v2+) */
  firstPersonLetter?: string;
  humanizedIntroduction: {
    title: string;
    text: string;
  };
  /** Parecer Neuropsicológico (novo em v2+) */
  neuropsychologicalReport?: {
    text: string;
    checklist: string[];
  };
  pedagogicalReport: {
    text: string;
    checklist: ChecklistItem[];
  };
  neuroPedagogicalReport: {
    text: string;
    checklist: ChecklistItem[];
  };
  /** Perfil de Aprendizagem (novo em v2+) */
  learningProfile?: {
    text: string;
    attentionSpan?: string;
  };
  bestLearningStrategies: {
    text: string;
    items: string[];
  };
  recommendedActivities: RecommendedActivity[];
  /** Potencialidades (novo em v2+) */
  strengths?: string[];
  /** Desafios nomeados, idealmente 3 (novo em v2+) */
  challenges?: ChallengeItem[];
  observationPoints: {
    text: string;
    checklist: string[];
  };
  carePoints: string[];
  nextSteps: string[];
  /** Fontes consideradas na geração (v2+) */
  sourcesConsidered?: string[];
  /** Principais mudanças em relação à versão anterior (v2+, apenas quando version >= 2) */
  changesSinceLastVersion?: string;
}

export interface IntelligentProfileRecord {
  id: string;
  student_id: string;
  tenant_id: string;
  generated_by: string | null;
  generated_by_name: string | null;
  version_number: number;
  profile_json: IntelligentProfileJSON;
  generation_type: 'initial' | 'update' | 'manual_edit';
  summary: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Próximo número de versão para um Perfil Inteligente.
 * Deve ser `max(version_number existente) + 1` — NUNCA `(versão selecionada) + 1`.
 * Regenerar a partir de uma versão antiga não pode gravar um número já usado
 * nem "furar" a sequência. (auditoria 30/08/2026 — M-06)
 *
 * `versions` deve conter apenas registros do MESMO aluno (as queries do
 * service já filtram por `student_id`; o `tenant_id` vai no insert).
 */
export function nextProfileVersion(versions: Array<{ version_number?: number | null }>): number {
  const max = (versions ?? []).reduce((m, v) => Math.max(m, Number(v?.version_number) || 0), 0);
  return max + 1;
}

export const IntelligentProfileService = {
  async getVersions(studentId: string): Promise<IntelligentProfileRecord[]> {
    const { data, error } = await supabase
      .from('student_intelligent_profiles')
      .select('*')
      .eq('student_id', studentId)
      .order('version_number', { ascending: false });

    if (error) {
      console.error('[IntelligentProfileService] getVersions:', error.message);
      return [];
    }
    return (data ?? []) as IntelligentProfileRecord[];
  },

  async getLatest(studentId: string): Promise<IntelligentProfileRecord | null> {
    const { data, error } = await supabase
      .from('student_intelligent_profiles')
      .select('*')
      .eq('student_id', studentId)
      .order('version_number', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('[IntelligentProfileService] getLatest:', error.message);
      return null;
    }
    return data as IntelligentProfileRecord | null;
  },

  async getTenantCount(tenantId: string): Promise<number> {
    const { count, error } = await supabase
      .from('student_intelligent_profiles')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId);
    if (error) {
      console.error('[IntelligentProfileService] getTenantCount:', error.message);
      return 0;
    }
    return count ?? 0;
  },

  async deleteAll(studentId: string): Promise<boolean> {
    const { error } = await supabase
      .from('student_intelligent_profiles')
      .delete()
      .eq('student_id', studentId);
    if (error) {
      console.error('[IntelligentProfileService] deleteAll:', error.message);
      return false;
    }
    return true;
  },

  async save(params: {
    studentId: string;
    tenantId: string;
    generatedBy: string | null;
    generatedByName: string | null;
    profileJson: IntelligentProfileJSON;
    generationType: 'initial' | 'update' | 'manual_edit';
    summary?: string;
    versionNumber: number;
  }): Promise<string | null> {
    const { data, error } = await supabase
      .from('student_intelligent_profiles')
      .insert({
        student_id:        params.studentId,
        tenant_id:         params.tenantId,
        generated_by:      params.generatedBy,
        generated_by_name: params.generatedByName,
        version_number:    params.versionNumber,
        profile_json:      params.profileJson,
        generation_type:   params.generationType,
        summary:           params.summary ?? null,
      })
      .select('id')
      .single();

    if (error) {
      console.error('[IntelligentProfileService] save:', error.message);
      return null;
    }
    return (data as any)?.id ?? null;
  },
};
