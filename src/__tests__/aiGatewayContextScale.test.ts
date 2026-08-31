/**
 * aiGatewayContextScale.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * M-05: a avaliação de Perfil Cognitivo usa escala 1–5. O contexto montado
 * pelo servidor (formatContextForPrompt / buildCognitiveBlock) apresentava os
 * scores como "/10", subestimando o aluno para o modelo (afeta o Plano AEE).
 */
import { describe, expect, it } from 'vitest';
import { formatContextForPrompt } from '../../supabase/functions/ai-gateway/_contextFormatter.ts';

function canonicalDataWithProfile(): any {
  return {
    student: { id: 's1', name: 'Aluno' },
    profile: {
      comunicacao_expressiva: 2, interacao_social: 3, autonomia_avd: 2,
      autorregulacao: 3, atencao_sustentada: 2, compreensao: 4,
      motricidade_fina: 3, motricidade_grossa: 4, participacao: 3, linguagem_leitura: 2,
      observation: 'Beneficia-se de instruções curtas.',
      evaluated_by: 'Prof. AEE', evaluated_at: '2026-08-01',
    },
    history: { tenant_appointments: [], student_timeline: [], observation_forms: [], medical_reports: [] },
    attached_documents: [], saved_documents: [], saved_action_plans: [],
    saved_aee_action_plans: [], saved_intelligent_profile: null, generated_activities: [],
  };
}

describe('formatContextForPrompt — escala do Perfil Cognitivo', () => {
  it('apresenta os scores como /5, nunca /10', () => {
    const out = formatContextForPrompt(canonicalDataWithProfile(), 'plano_acao_aee');
    expect(out).toContain('=== PERFIL COGNITIVO');
    expect(out).toMatch(/Aten[çc][ãa]o Sustentada: 2\/5/);
    expect(out).toContain('/5');
    expect(out).not.toContain('/10');
  });

  it('não quebra quando não há perfil cognitivo', () => {
    const data = canonicalDataWithProfile();
    data.profile = null;
    const out = formatContextForPrompt(data, 'plano_acao_aee');
    expect(out).not.toContain('PERFIL COGNITIVO');
  });
});
