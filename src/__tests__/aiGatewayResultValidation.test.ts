/**
 * aiGatewayResultValidation.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Validação estrutural + saneamento determinístico ANTES do commit do crédito
 * (Seção 3 da correção). Cobre os 7 casos exigidos:
 *   1. resultado completo → utilizável
 *   2. útil com campo OPCIONAL ausente → utilizável
 *   3. campo OBRIGATÓRIO ausente → inutilizável
 *   4. placeholder em campo OBRIGATÓRIO → inutilizável (vira ausência)
 *   5. tipo incorreto → inutilizável
 *   6. JSON truncado / curto demais → inutilizável
 *   7. texto sem JSON (não-objeto) → inutilizável
 * + isolamento entre requestType e passthrough dos demais.
 */
import { describe, expect, it } from 'vitest';
import {
  isPlaceholderText,
  sanitizeStructuredResult,
  validateStructuredResult,
} from '../../supabase/functions/ai-gateway/_resultValidation.ts';

// ─── Helpers de fixture ─────────────────────────────────────────────────────

const blk = (text: string) => ({ title: 't', items: [{ id: 'i1', text, done: false }] });

function completeRegente(): Record<string, unknown> {
  return {
    period: 'semanal', generatedAt: 'x', generatedBy: 'u', generatedByName: 'P',
    registrationNumber: '', version: 1,
    practicalObjective: 'Concluir leitura com apoio visual mantendo participação por blocos.',
    beforeClass: blk('Posicionar o aluno na primeira fila, ao lado do professor.'),
    duringClass: blk('Dar instruções em frases curtas com apoio de cartão visual.'),
    activitiesStrategies: blk('Oferecer metade das questões com o mesmo objetivo.'),
    assessment: blk('Registrar se concluiu com autonomia, mediação ou recusa.'),
    attentionObservations: blk('Observar sinais de sobrecarga em transições.'),
    communicationTeam: blk('Comunicar ao AEE o resultado da adaptação da semana.'),
  };
}

function completeAEE(): Record<string, unknown> {
  return {
    period: 'semanal', generatedAt: 'x', generatedBy: 'u', generatedByName: 'P',
    registrationNumber: '', version: 1,
    sessionObjective: 'Ampliar uso da prancha de comunicação com mediação decrescente.',
    welcomeRoutine: blk('Receber com rotina visual de 3 cartões.'),
    priorityBarrier: blk('Comunicação expressiva limitada em pedidos.'),
    sessionScript: blk('Início 0-5min: apresentar a agenda visual do dia.'),
    materials: blk('Prancha de comunicação com 6 figuras.'),
    applicationGuide: blk('Apresentar o material antes de pedir resposta.'),
    responseRecord: blk('Realizou com mediação verbal.'),
  };
}

function completeProfile(): Record<string, unknown> {
  return {
    studentName: 'Aluno Teste', generatedAt: 'x', generatedBy: 'P', version: 1,
    firstPersonLetter: 'Gosto de atividades com imagens e preciso de tempo para começar.',
    humanizedIntroduction: { title: 'Conhecendo', text: 'Participa das rodas e responde melhor com apoio visual.' },
    pedagogicalReport: {
      text: 'Perfil pedagógico em desenvolvimento conforme registros do professor regente.',
      checklist: [{ label: 'Autonomia nas atividades', status: 'em_desenvolvimento' }],
    },
    neuroPedagogicalReport: {
      text: 'Necessidades observáveis de organização de rotina e mediação em tarefas longas.',
      checklist: [{ label: 'Atenção sustentada', status: 'em_desenvolvimento' }],
    },
    bestLearningStrategies: { text: '', items: ['Aprende melhor com recursos visuais concretos.'] },
    recommendedActivities: [],
    observationPoints: { text: 'Observar aumento de autonomia nas próximas semanas.', checklist: [] },
  };
}

// ─── isPlaceholderText ─────────────────────────────────────────────────────

describe('isPlaceholderText', () => {
  it('detecta texto-molde do prompt', () => {
    expect(isPlaceholderText('[Nome do jogo]')).toBe(true);
    expect(isPlaceholderText('Jogo 1: [Nome específico do jogo] — Como usar')).toBe(true);
    expect(isPlaceholderText('Barreira observada: [descrição específica da barreira]')).toBe(true);
    expect(isPlaceholderText('[ALUNO]')).toBe(true);
    expect(isPlaceholderText('')).toBe(true);
    expect(isPlaceholderText('  -  ')).toBe(true);
    expect(isPlaceholderText('não informado')).toBe(true);
    expect(isPlaceholderText(null)).toBe(true);
  });
  it('NÃO marca texto pedagógico real como placeholder', () => {
    expect(isPlaceholderText('Dividir a atividade em 3 blocos de 4 questões, com pausa de 2 min.')).toBe(false);
    expect(isPlaceholderText('Usar timer visual de 5 minutos para delimitar a tarefa.')).toBe(false);
    expect(isPlaceholderText('Registrar autonomia, mediação verbal ou recusa da proposta.')).toBe(false);
  });
});

// ─── Caso 1: completo ─────────────────────────────────────────────────────

describe('resultado completo → utilizável', () => {
  it('plano_acao', () => {
    const doc = sanitizeStructuredResult(completeRegente(), 'plano_acao');
    expect(validateStructuredResult(doc, 'plano_acao').usable).toBe(true);
  });
  it('plano_acao_aee', () => {
    const doc = sanitizeStructuredResult(completeAEE(), 'plano_acao_aee');
    expect(validateStructuredResult(doc, 'plano_acao_aee').usable).toBe(true);
  });
  it('perfil_inteligente', () => {
    const doc = sanitizeStructuredResult(completeProfile(), 'perfil_inteligente');
    expect(validateStructuredResult(doc, 'perfil_inteligente').usable).toBe(true);
  });
});

// ─── Caso 2: campo opcional ausente → ainda utilizável ────────────────────

describe('campo OPCIONAL ausente → ainda utilizável', () => {
  it('plano_acao sem blocos opcionais (só os 6 core + objetivo)', () => {
    const doc = completeRegente(); // já não tem focusPlan/suggestedGames/etc
    const out = validateStructuredResult(sanitizeStructuredResult(doc, 'plano_acao'), 'plano_acao');
    expect(out.usable).toBe(true);
  });
  it('perfil_inteligente sem recommendedActivities / strengths', () => {
    const doc = completeProfile();
    delete (doc as any).strengths;
    delete (doc as any).recommendedActivities;
    const out = validateStructuredResult(sanitizeStructuredResult(doc, 'perfil_inteligente'), 'perfil_inteligente');
    expect(out.usable).toBe(true);
  });
  it('plano_acao_aee com bloco opcional placeholder → é removido, resultado segue utilizável', () => {
    const doc: any = completeAEE();
    doc.gamesResources = { title: 'Jogos', items: [{ id: 'g', text: '[Nome do jogo] — [passo a passo]', done: false }] };
    const sanitized: any = sanitizeStructuredResult(doc, 'plano_acao_aee');
    expect(sanitized.gamesResources).toBeUndefined(); // bloco opcional só de placeholder some
    expect(validateStructuredResult(sanitized, 'plano_acao_aee').usable).toBe(true);
  });
});

// ─── Caso 3: campo obrigatório ausente ───────────────────────────────────

describe('campo OBRIGATÓRIO ausente → inutilizável', () => {
  it('plano_acao sem communicationTeam', () => {
    const doc: any = completeRegente();
    delete doc.communicationTeam;
    const out = validateStructuredResult(sanitizeStructuredResult(doc, 'plano_acao'), 'plano_acao');
    expect(out.usable).toBe(false);
    expect(out.reason).toBe('MISSING_REQUIRED_BLOCK');
    expect(out.detail).toBe('communicationTeam');
  });
  it('plano_acao_aee sem sessionObjective', () => {
    const doc: any = completeAEE();
    delete doc.sessionObjective;
    expect(validateStructuredResult(sanitizeStructuredResult(doc, 'plano_acao_aee'), 'plano_acao_aee').usable).toBe(false);
  });
  it('perfil_inteligente sem pedagogicalReport', () => {
    const doc: any = completeProfile();
    delete doc.pedagogicalReport;
    expect(validateStructuredResult(sanitizeStructuredResult(doc, 'perfil_inteligente'), 'perfil_inteligente').usable).toBe(false);
  });
});

// ─── Caso 4: placeholder em campo obrigatório = ausência ─────────────────

describe('placeholder em campo OBRIGATÓRIO → inutilizável', () => {
  it('plano_acao: beforeClass só com itens-molde', () => {
    const doc: any = completeRegente();
    doc.beforeClass = { title: 'Antes', items: [
      { id: 'b1', text: 'Ação concreta de preparação do ambiente para [ALUNO]', done: false },
      { id: 'b2', text: '[descrição específica]', done: false },
    ] };
    const sanitized: any = sanitizeStructuredResult(doc, 'plano_acao');
    expect(sanitized.beforeClass.items).toHaveLength(0);
    const out = validateStructuredResult(sanitized, 'plano_acao');
    expect(out.usable).toBe(false);
    expect(out.reason).toBe('EMPTY_REQUIRED_BLOCK');
    expect(out.detail).toBe('beforeClass');
  });
  it('plano_acao: practicalObjective placeholder', () => {
    const doc: any = completeRegente();
    doc.practicalObjective = '[inserir o objetivo prático do período aqui]';
    const out = validateStructuredResult(sanitizeStructuredResult(doc, 'plano_acao'), 'plano_acao');
    expect(out.usable).toBe(false);
    expect(out.detail).toBe('practicalObjective');
  });
  it('perfil_inteligente: pedagogicalReport.text placeholder', () => {
    const doc: any = completeProfile();
    doc.pedagogicalReport.text = '[preencher com o parecer]';
    expect(validateStructuredResult(sanitizeStructuredResult(doc, 'perfil_inteligente'), 'perfil_inteligente').usable).toBe(false);
  });
});

// ─── Caso 5: tipo incorreto ─────────────────────────────────────────────

describe('tipo incorreto → inutilizável', () => {
  it('plano_acao recebe estrutura de import de alunos', () => {
    const doc = { students: [{ name: 'X' }], total: 1 };
    const out = validateStructuredResult(sanitizeStructuredResult(doc, 'plano_acao'), 'plano_acao');
    expect(out.usable).toBe(false);
  });
  it('bloco obrigatório com tipo errado (string em vez de objeto)', () => {
    const doc: any = completeRegente();
    doc.duringClass = 'texto solto';
    expect(validateStructuredResult(sanitizeStructuredResult(doc, 'plano_acao'), 'plano_acao').usable).toBe(false);
  });
});

// ─── Caso 6: JSON truncado / curto demais ──────────────────────────────

describe('JSON curto demais (truncado) → inutilizável', () => {
  it('objeto minúsculo para plano_acao', () => {
    const out = validateStructuredResult({ period: 'semanal' }, 'plano_acao');
    expect(out.usable).toBe(false);
    expect(out.reason).toBe('SUSPICIOUSLY_SHORT');
  });
});

// ─── Caso 7: não-objeto (texto sem JSON) ──────────────────────────────

describe('não-objeto → inutilizável', () => {
  it('array', () => {
    expect(validateStructuredResult([1, 2, 3], 'plano_acao').usable).toBe(false);
  });
  it('null', () => {
    expect(validateStructuredResult(null, 'perfil_inteligente').usable).toBe(false);
  });
  it('string', () => {
    expect(validateStructuredResult('resposta em texto puro', 'plano_acao_aee').usable).toBe(false);
  });
});

// ─── Isolamento / passthrough ────────────────────────────────────────

describe('outros requestType passam inalterados', () => {
  it('sanitize é identidade para requestType desconhecido', () => {
    const doc = { anything: '[placeholder]', foo: [] };
    expect(sanitizeStructuredResult(doc, 'estudo_de_caso')).toBe(doc);
    expect(sanitizeStructuredResult(doc, undefined)).toBe(doc);
  });
  it('validate retorna usable:true para requestType fora do alvo', () => {
    expect(validateStructuredResult({}, 'estudo_de_caso').usable).toBe(true);
    expect(validateStructuredResult({}, 'report_padrao').usable).toBe(true);
    expect(validateStructuredResult({}, undefined).usable).toBe(true);
  });
  it('um requestType não contamina a validação de outro', () => {
    const aee = completeAEE();
    // válido como AEE, inválido como plano_acao (não tem beforeClass) — sem estado compartilhado
    expect(validateStructuredResult(sanitizeStructuredResult(aee, 'plano_acao_aee'), 'plano_acao_aee').usable).toBe(true);
    expect(validateStructuredResult(aee, 'plano_acao').usable).toBe(false);
  });
});
