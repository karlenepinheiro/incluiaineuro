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
}

export interface IntelligentProfileRecord {
  id: string;
  student_id: string;
  tenant_id: string;
  generated_by: string | null;
  generated_by_name: string | null;
  version_number: number;
  profile_json: IntelligentProfileJSON;
  generation_type: 'initial' | 'update';
  summary: string | null;
  created_at: string;
  updated_at: string;
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

  async save(params: {
    studentId: string;
    tenantId: string;
    generatedBy: string | null;
    generatedByName: string | null;
    profileJson: IntelligentProfileJSON;
    generationType: 'initial' | 'update';
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
