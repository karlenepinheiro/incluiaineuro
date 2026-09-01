import { describe, expect, it } from 'vitest';
import { serviceRecordToSections, SERVICE_RECORD_FIELD_KEYS } from '../serviceRecord';
import {
  actionPlanRegenteToSections, actionPlanAeeToSections,
  ACTION_PLAN_REGENTE_BLOCK_ORDER, ACTION_PLAN_AEE_BLOCK_ORDER,
} from '../actionPlan';
import {
  checklistToSections,
  CHECKLIST_REGENTE_HEADER, CHECKLIST_REGENTE_SECTION_KEYS,
  CHECKLIST_CUIDADORA_SECTION_KEYS,
} from '../checklist';
import { careRoutineToSections } from '../careRoutine';
import {
  intelligentProfileToSections,
  INTELLIGENT_PROFILE_DOC_SECTIONS,
  INTELLIGENT_PROFILE_INTERNAL_FIELDS,
} from '../intelligentProfile';
import { studentProfileToSections } from '../studentProfile';
import { matriculaToSections } from '../matricula';
import { routeBibliotecaItem } from '../biblioteca';

const titles = (secs: { title: string }[]) => secs.map(s => s.title);
const allText = (secs: any[]) => JSON.stringify(secs);

// ─── Registro de Atendimento ────────────────────────────────────────────────

describe('serviceRecordToSections', () => {
  const rec: any = {
    id: 'r1', studentId: 's1', studentName: 'Ana', date: '2026-08-20',
    type: 'AEE', professional: 'Prof. X', duration: 50, attendance: 'Presente',
    createdAt: '2026-08-20T14:00:00Z',
    dailyChecklist: {
      desempenho: 6, interacao: 5, comportamento: 'adequado',
      progressoAtividade: 'Avançou na leitura.', estrategiasUsadas: 'Pistas visuais.', proximosPassos: 'Ampliar tempo.',
    },
  };

  it('cobre TODOS os campos conhecidos do ServiceRecord (anti-regressão)', () => {
    const dump = allText(serviceRecordToSections(rec));
    expect(dump).toContain('AEE');
    expect(dump).toContain('Presente');
    expect(dump).toContain('Prof. X');
    expect(dump).toContain('Avançou na leitura.');
    expect(dump).toContain('Pistas visuais.');
    expect(dump).toContain('Ampliar tempo.');
    expect(dump).toContain('Adequado');
    // a lista de chaves declarada existe
    expect(SERVICE_RECORD_FIELD_KEYS.length).toBeGreaterThan(10);
  });

  it('sem ficha diária: seções de ficha somem; observação vazia → "Não informado"', () => {
    const secs = serviceRecordToSections({ ...rec, dailyChecklist: undefined, observation: '' });
    expect(titles(secs)).toEqual(['Dados do Atendimento', 'Observações do Atendimento']);
    expect(allText(secs)).toContain('Não informado');
  });
});

// ─── Planos de Ação (Regente ≠ AEE) ─────────────────────────────────────────

describe('actionPlan — regente e AEE são distintos', () => {
  const mkBlock = (t: string) => ({ title: t, items: [{ id: '1', text: `item de ${t}`, done: false }] });
  const regente: any = {
    period: 'mensal', registrationNumber: 'REG-20260801-120000-ABCD', version: 1,
    generatedBy: 'x', generatedByName: 'Prof. Y', generatedAt: '2026-08-01T12:00:00Z',
    practicalObjective: 'Melhorar foco', nextStep: 'Revisar em 30 dias',
    beforeClass: mkBlock('Antes da Aula'), duringClass: mkBlock('Durante a Aula'),
    activitiesStrategies: mkBlock('Atividades'), assessment: mkBlock('Avaliação'),
    attentionObservations: mkBlock('Atenção'), communicationTeam: mkBlock('Comunicação'),
  };
  const aee: any = {
    period: 'semanal', registrationNumber: 'REG-20260801-120000-WXYZ', version: 2,
    generatedBy: 'x', generatedByName: 'Prof. AEE', generatedAt: '2026-08-01T12:00:00Z',
    sessionObjective: 'Integração sensorial',
    welcomeRoutine: mkBlock('Acolhida'), priorityBarrier: mkBlock('Barreira'),
    sessionScript: mkBlock('Roteiro'), materials: mkBlock('Materiais'),
    applicationGuide: mkBlock('Como Aplicar'), responseRecord: mkBlock('Registro de Resposta'),
  };

  it('regente: identificação + objetivo + blocos na ordem canônica + próximo passo', () => {
    const t = titles(actionPlanRegenteToSections(regente));
    expect(t[0]).toBe('Identificação do Plano');
    expect(t).toContain('Objetivo Prático do Período');
    expect(t).toContain('Antes da Aula');
    expect(t[t.length - 1]).toBe('Próximo Passo');
    expect(ACTION_PLAN_REGENTE_BLOCK_ORDER).toContain('beforeClass');
  });

  it('AEE: usa blocos PRÓPRIOS (Acolhida/Roteiro), não os do regente', () => {
    const t = titles(actionPlanAeeToSections(aee));
    expect(t).toContain('Acolhida');
    expect(t).toContain('Roteiro');
    expect(t).not.toContain('Antes da Aula');
    expect(ACTION_PLAN_AEE_BLOCK_ORDER).toContain('welcomeRoutine');
  });

  it('itens concluídos são marcados (✔) — fidelidade do estado', () => {
    const done: any = { ...regente, beforeClass: { title: 'Antes', items: [{ id: '1', text: 'feito', done: true }] } };
    expect(allText(actionPlanRegenteToSections(done))).toContain('✔ feito');
  });
});

// ─── Checklists ─────────────────────────────────────────────────────────────

describe('checklistToSections', () => {
  it('regente: cabeçalho + contexto + 1 seção por grupo + observações; item marcado aparece', () => {
    const data: any = {
      professor: 'Prof. Z', serie: '3º ano', dataObservacao: '2026-08-15',
      contextoObservado: ['Aula expositiva'],
      atencaoParticipacao: ['Mantém atenção com mediação'],
      comunicacao: [], interacaoSocial: [], autonomia: [], aprendizagem: [],
      regulacaoComportamento: [], estrategiasEficazes: [], recomendacoesImediatas: [],
      observacoesLivres: 'Boa aula.',
    };
    const secs = checklistToSections({
      title: 'Checklist Regente', data,
      headerFields: CHECKLIST_REGENTE_HEADER,
      sections: CHECKLIST_REGENTE_SECTION_KEYS.map(id => ({ id, label: id })),
      contextKey: 'contextoObservado', contextLabel: 'Contexto Observado',
    });
    expect(titles(secs)[0]).toBe('Identificação');
    expect(titles(secs)).toContain('Contexto Observado');
    expect(allText(secs)).toContain('Mantém atenção com mediação');
    expect(allText(secs)).toContain('Prof. Z');
    expect(allText(secs)).toContain('Boa aula.');
  });

  it('cuidadora tem 10 grupos de seção declarados', () => {
    expect(CHECKLIST_CUIDADORA_SECTION_KEYS.length).toBe(10);
  });
});

// ─── Rotina da Cuidadora ────────────────────────────────────────────────────

describe('careRoutineToSections', () => {
  it('mapeia text/checklist/scale/suggestions/rubric; respeita order_index', () => {
    const sections: any = [
      {
        title: 'Manhã', order_index: 0, fields: [
          { label: 'Chegada', field_type: 'text', value: 'Chega às 7h', order_index: 0 },
          { label: 'Rotina', field_type: 'checklist', value: { checked: [0, 2] }, options: { items: ['Guardar mochila', 'Lavar as mãos', 'Sentar no lugar'] }, order_index: 1 },
          { label: 'Humor', field_type: 'scale', value: { score: 4 }, options: { min: 1, max: 5 }, order_index: 2 },
        ],
      },
      {
        title: 'Almoço', order_index: 1, fields: [
          { label: 'Apoios', field_type: 'suggestions', value: { selected: [1], text: 'Come melhor com colher adaptada' }, options: { chips: ['Prato antiderrapante', 'Colher adaptada'] }, order_index: 0 },
        ],
      },
    ];
    const secs = careRoutineToSections(sections);
    expect(titles(secs)).toEqual(['Manhã', 'Almoço']);
    const dump = allText(secs);
    expect(dump).toContain('Chega às 7h');
    expect(dump).toContain('Guardar mochila');
    expect(dump).toContain('Sentar no lugar');
    expect(dump).not.toContain('Lavar as mãos'); // idx 1 não marcado
    expect(dump).toContain('Colher adaptada');
    expect(dump).toContain('Come melhor com colher adaptada');
  });
});

// ─── Perfil Inteligente ─────────────────────────────────────────────────────

describe('intelligentProfileToSections', () => {
  const profile: any = {
    studentName: 'Bruno', generatedAt: '2026-08-01T10:00:00Z', generatedBy: 'IA', version: 3,
    firstPersonLetter: 'Olá, professora! Eu aprendo melhor com imagens.',
    humanizedIntroduction: { title: 'Quem sou eu', text: 'x' },
    neuropsychologicalReport: { text: 'Parecer NPS.', checklist: ['memória visual preservada'] },
    pedagogicalReport: { text: 'Parecer pedagógico.', checklist: [{ label: 'Leitura', status: 'em_desenvolvimento' }] },
    neuroPedagogicalReport: { text: 'Parecer neuroped.', checklist: [{ label: 'Atenção', status: 'nao_observado' }] },
    learningProfile: { text: 'Aprende por exploração.', attentionSpan: '10 minutos' },
    bestLearningStrategies: { text: 'Estratégias.', items: ['Rotina visual'] },
    recommendedActivities: [{ title: 'Jogo da memória', objective: 'x', howToApply: 'y', whyItHelps: 'z', supportLevel: 'Médio', incluiLabPrompt: '' }],
    strengths: ['Memória visual'],
    challenges: [{ title: 'Transições', description: 'dificuldade com mudanças' }],
    observationPoints: { text: 'Observar.', checklist: ['tempo de resposta'] },
    carePoints: ['evitar barulho'],
    nextSteps: ['revisar em 60 dias'],
    sourcesConsidered: ['Estudo de Caso', 'Relatório da família'],
    changesSinceLastVersion: 'Incluída carta em 1ª pessoa.',
  };

  it('CORREÇÃO DE PARIDADE: seções = documento final (tela + PDF), na ordem exata', () => {
    const secs = intelligentProfileToSections(profile);
    expect(titles(secs)).toEqual([...INTELLIGENT_PROFILE_DOC_SECTIONS]);
  });

  it('conteúdo final (o que a tela e o PDF mostram) está presente', () => {
    const dump = allText(intelligentProfileToSections(profile));
    expect(dump).toContain('Olá, professora!');       // firstPersonLetter → Quem sou eu?
    expect(dump).toContain('Parecer pedagógico.');
    expect(dump).toContain('Parecer neuroped.');
    expect(dump).toContain('Memória visual');         // strengths → Potencialidades
    expect(dump).toContain('Rotina visual');          // bestLearningStrategies.items
    expect(dump).toContain('Jogo da memória');        // recommendedActivities
    expect(dump).toContain('Transições');             // challenges → Pontos de Cuidado
    expect(dump).toContain('tempo de resposta');      // observationPoints.checklist
  });

  it('METADADOS INTERNOS e campos não-publicados NÃO vazam para o modelo', () => {
    const dump = allText(intelligentProfileToSections(profile));
    // neuropsychologicalReport — não publicado
    expect(dump).not.toContain('Parecer NPS.');
    expect(dump).not.toContain('memória visual preservada');
    // learningProfile — não publicado
    expect(dump).not.toContain('Aprende por exploração.');
    expect(dump).not.toContain('10 minutos');
    // sourcesConsidered — metadado de auditoria
    expect(dump).not.toContain('Relatório da família');
    // changesSinceLastVersion — metadado de changelog
    expect(dump).not.toContain('Incluída carta em 1ª pessoa.');
    // nextSteps não vira seção própria (só fallback de Potencialidades, aqui não usado)
    expect(titles(intelligentProfileToSections(profile))).not.toContain('Próximos Passos');
  });

  it('nenhum nome técnico em inglês aparece no modelo', () => {
    const dump = allText(intelligentProfileToSections(profile));
    for (const tech of INTELLIGENT_PROFILE_INTERNAL_FIELDS) {
      expect(dump).not.toContain(tech);
    }
    expect(dump).not.toMatch(/incluiLabPrompt|supportLevel|attentionSpan/);
  });

  it('nextSteps É usado como fallback de Potencialidades quando strengths está vazio (mesma regra da tela/PDF)', () => {
    const semStrengths = { ...profile, strengths: [], nextSteps: ['revisar o perfil em 60 dias'] };
    const dump = allText(intelligentProfileToSections(semStrengths as any));
    const pot = intelligentProfileToSections(semStrengths as any).find(s => s.title === 'Potencialidades')!;
    expect(allText([pot])).toContain('revisar o perfil em 60 dias');
  });

  it('carePoints É usado como fallback de Pontos de Cuidado quando challenges está vazio', () => {
    const semChallenges = { ...profile, challenges: [], carePoints: ['evitar ambientes barulhentos'] };
    const cuid = intelligentProfileToSections(semChallenges as any).find(s => s.title === 'Pontos de Cuidado')!;
    expect(allText([cuid])).toContain('evitar ambientes barulhentos');
  });

  it('título carrega a versão selecionada', () => {
    const secs = intelligentProfileToSections(profile);
    expect(allText(secs)).toContain('"Versão"');
    expect(allText(secs)).toContain('"3"');
  });
});

// ─── Perfil do Aluno (dossiê) — distinto do Perfil Inteligente ──────────────

describe('studentProfileToSections', () => {
  const student: any = {
    id: 'stu', name: 'Carla', birthDate: '2015-01-01', gender: 'Feminino',
    grade: '4º ano', shift: 'Manhã', schoolName: 'EM Teste', regentTeacher: 'Prof. R',
    diagnosis: ['TEA'], cid: 'F84.0', supportLevel: 'Nível 1', medication: '',
    professionals: ['Fono'], abilities: ['Memória'], difficulties: ['Atenção'],
    strategies: ['Rotina visual'], communication: ['Verbal'], observations: 'Colaborativa.',
    schoolHistory: 'Sem repetências.', familyContext: 'Família participativa.',
    guardianName: 'Mãe', guardianPhone: '(00) 0000-0000',
  };

  it('usa dados cadastrais; respeita config; NÃO contém campos do Perfil Inteligente', () => {
    const secs = studentProfileToSections(student, { config: { dadosSociofamiliares: false } });
    const dump = allText(secs);
    expect(dump).toContain('Carla');
    expect(dump).toContain('TEA');
    expect(dump).toContain('Rotina visual');
    expect(titles(secs)).not.toContain('Contexto Sociofamiliar'); // desligado no config
    expect(dump).not.toContain('firstPersonLetter');
    expect(dump).not.toContain('humanizedIntroduction');
  });
});

// ─── Matrícula ──────────────────────────────────────────────────────────────

describe('matriculaToSections', () => {
  const student: any = { id: 's', name: 'Davi', grade: '2º ano', shift: 'Tarde', birthDate: '2017-05-05', guardianName: 'Pai', guardianPhone: '9999' };
  const school: any = { schoolName: 'EM Central' };

  it.each(['termo_aee', 'declaracao_matricula_srm', 'declaracao_compromisso'] as const)(
    '%s: identificação + corpo + base legal, com nome do aluno e referências legais',
    (tipo) => {
      const secs = matriculaToSections(tipo, student, school);
      expect(titles(secs)[0]).toBe('Identificação do Aluno');
      expect(titles(secs)).toContain('Base Legal');
      const dump = allText(secs);
      expect(dump).toContain('Davi');
      expect(dump).toContain('EM Central');
      expect(dump).toContain('Resolução CNE/CEB nº 4/2009');
      expect(dump).toContain('LGPD');
    },
  );
});

// ─── Biblioteca — roteamento ────────────────────────────────────────────────

describe('routeBibliotecaItem', () => {
  it('documento formal salvo (PEI) → tipo canônico + seções da versão salva', () => {
    const r = routeBibliotecaItem({
      doc_type: 'PEI', audit_code: 'VAL-20260801-120000-ABCD',
      structured_data: { sections: [{ id: 's1', title: 'Objetivos', fields: [{ id: 'f', label: '', type: 'textarea', value: 'meta X' }] }] },
    });
    expect(r.canonicalDocumentType).toBe('PEI');
    expect(r.sections[0].title).toBe('Objetivos');
    expect(r.isIncluiLabActivity).toBe(false);
  });

  it('Relatório Técnico salvo → adaptador do relatório', () => {
    const r = routeBibliotecaItem({
      doc_type: 'RELATORIO_TECNICO',
      structured_data: { data: { tipo: 'simples', identificacao: 'X', dificuldades: [], conclusao: 'Y', recomendacoes: [] }, codigoDoc: 'REG-1', geradoEm: '2026-01-01', geradoPor: 'P' },
    });
    expect(r.canonicalDocumentType).toBeNull();
    expect(titles(r.sections)).toContain('Identificação do Aluno');
  });

  it('atividade do IncluiLAB → sinalizada, não usa renderer formal', () => {
    const r = routeBibliotecaItem({ doc_type: 'atividade_incluilab', structured_data: { activity: {} } });
    expect(r.isIncluiLabActivity).toBe(true);
  });

  it('documento sem estrutura → seção "Conteúdo" com o texto bruto (não quebra)', () => {
    const r = routeBibliotecaItem({ doc_type: 'OUTRO', structured_data: 'texto solto do documento' });
    expect(allText(r.sections)).toContain('texto solto do documento');
  });
});
