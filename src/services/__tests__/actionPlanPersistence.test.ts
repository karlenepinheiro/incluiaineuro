/**
 * actionPlanPersistence.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Correção C-01 (auditoria 30/08/2026): o Plano de Ação do Professor Regente
 * descartava 11 campos gerados pela IA na persistência. Este teste garante,
 * com SENTINELAS ÚNICAS por campo, que os 11 campos sobrevivem a:
 *
 *   planJsonToContentJson → content_json (banco) → rowToRecord → plan_json
 *   → actionPlanRegenteToSections (modelo do PDF/Word) → document.xml do .docx
 *
 * Também: regressão do Plano AEE (persistência fiel — referência) e prova de
 * que campos opcionais AUSENTES não viram bloco fantasma na reabertura.
 */
import PizZip from 'pizzip';
import { describe, expect, it } from 'vitest';
import type { ActionPlanJSON, AEEActionPlanJSON, Student } from '../../types';
import { planJsonToContentJson, rowToRecord } from '../actionPlanService';
import {
  planJsonToContentJson as aeePlanToCj,
  rowToRecord as aeeRowToRecord,
} from '../aeeActionPlanService';
import { actionPlanRegenteToSections, actionPlanAeeToSections } from '../documentModel/actionPlan';
import { exportGenericDocumentToWord } from '../wordExportService';

const student = { name: 'Aluno Teste', grade: '4º ano', shift: 'Manhã', schoolName: 'EM Teste' } as Student;

function block(title: string, sentinel: string) {
  return { title, items: [{ id: 'x1', text: sentinel, done: false }] };
}

/** Plano Regente com uma sentinela única em CADA um dos 17 campos. */
function fullRegentePlan(): ActionPlanJSON {
  return {
    period: 'semanal',
    generatedAt: '2026-08-30T10:00:00.000Z',
    generatedBy: 'user-1',
    generatedByName: 'Prof. Teste',
    registrationNumber: '',
    version: 1,
    practicalObjective: 'SENT_practicalObjective_único',
    nextStep: 'SENT_nextStep_único',
    focusPlan:             block('Foco do Plano', 'SENT_focusPlan_único'),
    mainBarrier:           block('Barreira Principal em Sala', 'SENT_mainBarrier_único'),
    beforeClass:           block('Antes da Aula', 'SENT_beforeClass_único'),
    duringClass:           block('Durante a Aula', 'SENT_duringClass_único'),
    activitiesStrategies:  block('Atividades e Estratégias', 'SENT_activitiesStrategies_único'),
    assessment:            block('Avaliação', 'SENT_assessment_único'),
    attentionObservations: block('Atenção e Observações', 'SENT_attentionObservations_único'),
    communicationTeam:     block('Comunicação com AEE / Família', 'SENT_communicationTeam_único'),
    suggestedGames:        block('Jogos Sugeridos', 'SENT_suggestedGames_único'),
    suggestedVideos:       block('Vídeos Sugeridos', 'SENT_suggestedVideos_único'),
    suggestedMaterials:    block('Materiais Sugeridos', 'SENT_suggestedMaterials_único'),
    suggestedDynamics:     block('Dinâmicas Sugeridas', 'SENT_suggestedDynamics_único'),
    adaptations:           block('Adaptações da Atividade', 'SENT_adaptations_único'),
    evidenceRecording:     block('Como Registrar Evidências', 'SENT_evidenceRecording_único'),
    studentResponse:       block('Resposta do Aluno', 'SENT_studentResponse_único'),
  };
}

const ALL_SENTINELS = [
  'SENT_practicalObjective_único', 'SENT_nextStep_único', 'SENT_focusPlan_único',
  'SENT_mainBarrier_único', 'SENT_beforeClass_único', 'SENT_duringClass_único',
  'SENT_activitiesStrategies_único', 'SENT_assessment_único', 'SENT_attentionObservations_único',
  'SENT_communicationTeam_único', 'SENT_suggestedGames_único', 'SENT_suggestedVideos_único',
  'SENT_suggestedMaterials_único', 'SENT_suggestedDynamics_único', 'SENT_adaptations_único',
  'SENT_evidenceRecording_único', 'SENT_studentResponse_único',
];

/** Simula o ciclo: serializa → grava como content_json → reabre. */
function roundTrip(plan: ActionPlanJSON): ActionPlanJSON {
  const contentJson = planJsonToContentJson(plan);
  const row = {
    id: 'plan-1', student_id: 's1', tenant_id: 't1',
    plan_type: 'weekly', register_code: 'REG-TEST', version_number: 1,
    generated_at: plan.generatedAt, generated_by: plan.generatedBy,
    generated_by_name: plan.generatedByName, created_at: plan.generatedAt,
    content_json: JSON.parse(JSON.stringify(contentJson)), // simula ida/volta jsonb
  };
  return rowToRecord(row).plan_json;
}

async function docXml(blob: Blob): Promise<string> {
  const zip = new PizZip(Buffer.from(await blob.arrayBuffer()));
  return zip.file('word/document.xml')!.asText();
}

describe('Plano Regente — persistência dos 11 campos enriquecidos (C-01)', () => {
  it('planJsonToContentJson grava todos os 17 campos em content_json', () => {
    const cj = planJsonToContentJson(fullRegentePlan());
    for (const key of [
      'before_class', 'during_class', 'activities_strategies', 'assessment',
      'attention_observations', 'communication', 'practical_objective', 'next_step',
      'focus_plan', 'main_barrier', 'suggested_games', 'suggested_videos',
      'suggested_materials', 'suggested_dynamics', 'adaptations', 'evidence_recording',
      'student_response',
    ]) {
      expect(cj, `content_json deve conter "${key}"`).toHaveProperty(key);
    }
    expect(JSON.stringify(cj)).toContain('SENT_focusPlan_único');
    expect(JSON.stringify(cj)).toContain('SENT_nextStep_único');
  });

  it('rowToRecord reabre exatamente os mesmos dados (round-trip fiel)', () => {
    const reopened = roundTrip(fullRegentePlan());
    const dump = JSON.stringify(reopened);
    for (const s of ALL_SENTINELS) {
      expect(dump, `sentinela ausente na reabertura: ${s}`).toContain(s);
    }
    expect(reopened.practicalObjective).toBe('SENT_practicalObjective_único');
    expect(reopened.nextStep).toBe('SENT_nextStep_único');
    expect(reopened.focusPlan?.items[0].text).toBe('SENT_focusPlan_único');
    expect(reopened.studentResponse?.items[0].text).toBe('SENT_studentResponse_único');
  });

  it('modelo do PDF/Word (actionPlanRegenteToSections) recebe os 17 campos', () => {
    const reopened = roundTrip(fullRegentePlan());
    const dump = JSON.stringify(actionPlanRegenteToSections(reopened));
    for (const s of ALL_SENTINELS) {
      expect(dump, `sentinela ausente no modelo de exportação: ${s}`).toContain(s);
    }
  });

  it('.docx real (Word / Blob do Google Docs) contém as 17 sentinelas', async () => {
    const reopened = roundTrip(fullRegentePlan());
    const blob = await exportGenericDocumentToWord({
      title: 'Plano de Ação — Professor Regente',
      data: { sections: actionPlanRegenteToSections(reopened) },
      student,
      auditCode: 'REG-TEST',
    });
    const xml = await docXml(blob);
    for (const s of ALL_SENTINELS) {
      expect(xml, `sentinela ausente no document.xml: ${s}`).toContain(s);
    }
  });

  it('campos opcionais AUSENTES não viram bloco fantasma na reabertura', () => {
    const minimal: ActionPlanJSON = {
      period: 'mensal', generatedAt: '2026-08-30T10:00:00.000Z', generatedBy: 'u',
      generatedByName: 'P', registrationNumber: '', version: 1,
      beforeClass:           block('Antes da Aula', 'a'),
      duringClass:           block('Durante a Aula', 'b'),
      activitiesStrategies:  block('Atividades e Estratégias', 'c'),
      assessment:            block('Avaliação', 'd'),
      attentionObservations: block('Atenção e Observações', 'e'),
      communicationTeam:     block('Comunicação', 'f'),
    };
    const reopened = roundTrip(minimal);
    expect(reopened.practicalObjective).toBeUndefined();
    expect(reopened.nextStep).toBeUndefined();
    expect(reopened.focusPlan).toBeUndefined();
    expect(reopened.suggestedGames).toBeUndefined();
    expect(reopened.studentResponse).toBeUndefined();
    // Os 6 obrigatórios continuam presentes
    expect(reopened.beforeClass.items[0].text).toBe('a');
  });

  it('planos ANTIGOS (content_json só com 6 blocos) continuam abrindo', () => {
    const legacyRow = {
      id: 'old', student_id: 's', tenant_id: 't', plan_type: 'monthly',
      register_code: 'REG-OLD', version_number: 1, created_at: '2026-01-01T00:00:00Z',
      content_json: {
        before_class: [{ id: 'bc1', text: 'antigo', done: false }],
        during_class: [], activities_strategies: [], assessment: [],
        attention_observations: [], communication: [],
      },
    };
    const rec = rowToRecord(legacyRow);
    expect(rec.plan_json.beforeClass.items[0].text).toBe('antigo');
    expect(rec.plan_json.focusPlan).toBeUndefined();
  });
});

describe('Plano AEE — regressão de persistência fiel (referência)', () => {
  function aeeBlock(title: string, sentinel: string) {
    return { title, items: [{ id: 'y1', text: sentinel, done: false }] };
  }
  function fullAeePlan(): AEEActionPlanJSON {
    return {
      period: 'semanal', generatedAt: '2026-08-30T10:00:00.000Z', generatedBy: 'u',
      generatedByName: 'Prof AEE', registrationNumber: '', version: 1,
      sessionObjective: 'AEE_SENT_sessionObjective',
      nextStep: 'AEE_SENT_nextStep',
      welcomeRoutine:   aeeBlock('Acolhida', 'AEE_SENT_welcome'),
      priorityBarrier:  aeeBlock('Barreira', 'AEE_SENT_barrier'),
      sessionScript:    aeeBlock('Roteiro', 'AEE_SENT_script'),
      materials:        aeeBlock('Materiais', 'AEE_SENT_materials'),
      applicationGuide: aeeBlock('Como Aplicar', 'AEE_SENT_apply'),
      responseRecord:   aeeBlock('Registro', 'AEE_SENT_response'),
      gamesResources:   aeeBlock('Jogos', 'AEE_SENT_games'),
      adaptationsGuide: aeeBlock('Como Adaptar', 'AEE_SENT_adapt'),
    };
  }

  it('AEE round-trip preserva blocos core e opcionais', () => {
    const plan = fullAeePlan();
    const cj = JSON.parse(JSON.stringify(aeePlanToCj(plan)));
    const row = {
      id: 'a1', student_id: 's', tenant_id: 't', plan_type: 'weekly',
      register_code: 'REG-AEE', version_number: 1, created_at: plan.generatedAt,
      generated_at: plan.generatedAt, generated_by: 'u', generated_by_name: 'Prof AEE',
      content_json: cj,
    };
    const reopened = aeeRowToRecord(row).plan_json;
    const dump = JSON.stringify(actionPlanAeeToSections(reopened));
    for (const s of ['AEE_SENT_sessionObjective', 'AEE_SENT_nextStep', 'AEE_SENT_welcome',
      'AEE_SENT_barrier', 'AEE_SENT_script', 'AEE_SENT_materials', 'AEE_SENT_apply',
      'AEE_SENT_response', 'AEE_SENT_games', 'AEE_SENT_adapt']) {
      expect(dump, `AEE sentinela ausente: ${s}`).toContain(s);
    }
  });
});
