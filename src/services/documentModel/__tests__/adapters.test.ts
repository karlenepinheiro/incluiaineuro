import { describe, expect, it } from 'vitest';
import type { RelatorioResultado } from '../../reportService';
import { relatorioTecnicoToSections, relatorioTecnicoTitle } from '../relatorioTecnico';
import { fichaToSections } from '../ficha';
import { quickDocToSections, quickDocTitle } from '../quickDoc';
import { relatorioEvolucaoToSections } from '../relatorioEvolucao';

const titles = (secs: { title: string }[]) => secs.map(s => s.title);

// ─── Relatório Técnico (mesmo fluxo: simples | inss | completo) ───────────────

describe('relatorioTecnicoToSections', () => {
  const base = (data: any): RelatorioResultado => ({
    data, codigoDoc: 'REG-ABC123', geradoEm: '2026-08-01T12:00:00Z', geradoPor: 'Prof. Ana', rawText: '',
  });

  it('modo SIMPLES: ordem canônica de seções + "Não informado" em campos vazios', () => {
    const secs = relatorioTecnicoToSections(base({
      tipo: 'simples',
      identificacao: 'Aluno João, 8 anos.',
      situacaoPedagogicaAtual: 'Está em processo de alfabetização.',
      situacaoFuncional: '',
      dificuldades: ['Atenção sustentada'],
      observacoesRelevantes: '',
      conclusao: 'Recomenda-se acompanhamento.',
      recomendacoes: ['Rotina visual', 'Tempo estendido'],
    }));
    expect(titles(secs)).toEqual([
      'Identificação do Aluno',
      'Situação Pedagógica Atual',
      'Situação Funcional',
      'Dificuldades Observadas',
      'Observações Relevantes',
      'Conclusão e Parecer Técnico',
      'Recomendações',
    ]);
    const funcional = secs.find(s => s.title === 'Situação Funcional')!;
    expect(funcional.fields[0].value).toBe('Não informado');
  });

  it('modo INSS: usa o mesmo adaptador, título dedicado', () => {
    expect(relatorioTecnicoTitle({ tipo: 'inss' } as any)).toContain('INSS');
    const secs = relatorioTecnicoToSections(base({
      tipo: 'inss', identificacao: 'X', situacaoFuncional: 'Y', dificuldades: [], conclusao: 'Z', recomendacoes: [],
    }));
    expect(titles(secs)).toContain('Identificação do Aluno');
  });

  it('modo COMPLETO: inclui resumo, perfil cognitivo, checklist (tabela) e recomendações multidisciplinares', () => {
    const secs = relatorioTecnicoToSections(base({
      tipo: 'completo',
      resumoExecutivo: 'Resumo.',
      identificacao: 'Ident.',
      historicoRelevante: 'Hist.',
      analisePedagogica: 'Análise.',
      situacaoFuncional: 'Funcional.',
      perfilCognitivo: 'Perfil cognitivo preservado.',
      dificuldades: ['D1'], potencialidades: ['P1'], estrategiasEficazes: ['E1'],
      checklist: [{ area: 'Linguagem', presente: true, grau: 'moderado', obs: 'atraso leve' }],
      evolucaoObservada: 'Evoluiu.',
      observacoesRelevantes: 'Obs.',
      conclusao: 'Conclusão.',
      recomendacoesPedagogicas: ['RP1'], recomendacoesClinicas: ['RC1'],
      recomendacoesFamiliares: [], recomendacoesInstitucionais: [],
    }), { scores: [4, 3, 5, 2, 4, 3, 4, 5, 3, 4] });

    expect(titles(secs)).toEqual([
      'Resumo Executivo',
      'Identificação do Aluno',
      'Avaliação Multidimensional (Escala 1–5)',
      'Histórico Relevante',
      'Análise Pedagógica',
      'Situação Funcional',
      'Perfil Cognitivo e Funcional',
      'Dificuldades Observadas',
      'Potencialidades e Habilidades',
      'Estratégias com Resultados Positivos',
      'Checklist de Áreas de Desenvolvimento',
      'Evolução Observada',
      'Observações Relevantes',
      'Conclusão e Parecer Técnico',
      'Recomendações Multidisciplinares',
    ]);
    const checklist = secs.find(s => s.title === 'Checklist de Áreas de Desenvolvimento')!;
    expect(checklist.fields[0].type).toBe('grid');
    expect(checklist.fields[0].value[0]).toEqual(['Área', 'Situação', 'Grau', 'Observação']);
    const escala = secs.find(s => s.title.startsWith('Avaliação Multidimensional'))!;
    expect(escala.fields.some(f => f.label === 'Média geral')).toBe(true);
  });
});

// ─── Fichas (Observação de Sala, Escuta da Família, Análise AEE, …) ───────────

describe('fichaToSections (família de fichas)', () => {
  it('uma seção com todos os campos; escala vira scale; vazio → "Não informado"; acentos preservados', () => {
    const secs = fichaToSections('Escuta da Família', [
      { label: 'Relato da Família', value: 'A família observa evolução na comunicação.' },
      { label: 'Preocupações Sinalizadas', value: '' },
      { label: 'Nível Geral', value: '3', isScale: true },
    ]);
    expect(secs).toHaveLength(1);
    expect(secs[0].title).toBe('Campos de Observação — Escuta da Família');
    const rel = secs[0].fields.find(f => f.label === 'Relato da Família')!;
    expect(rel.value).toContain('comunicação');
    expect(secs[0].fields.find(f => f.label === 'Preocupações Sinalizadas')!.value).toBe('Não informado');
    expect(secs[0].fields.find(f => f.label === 'Nível Geral')!.type).toBe('scale');
  });
});

// ─── QuickDoc (3 tipos) ──────────────────────────────────────────────────────

describe('quickDocToSections', () => {
  it.each([
    ['encaminhamento_redes', ['Identificação do Encaminhamento']],
    ['convite_reuniao', ['Dados da Convocação', 'Pauta e Objetivo da Reunião']],
    ['termo_desligamento', ['Dados do Período de Atendimento', 'Síntese da Evolução Pedagógica']],
  ] as const)('%s produz as seções esperadas', (docType, expectedTitles) => {
    const secs = quickDocToSections(docType as any, {
      setor: 'CAPS', motivo_opcao: 'Acompanhamento psicológico',
      data_horario: '20/09/2026 14h', pauta: 'Revisão do PEI',
      evolucao: 'Avançou na autonomia.', motivo_opcao_x: '',
    }, { studentName: 'Ana' });
    for (const t of expectedTitles) expect(titles(secs)).toContain(t);
    expect(quickDocTitle(docType as any)).toBeTruthy();
  });

  it('seções opcionais somem quando o campo está vazio (igual ao PDF)', () => {
    const secs = quickDocToSections('encaminhamento_redes', { setor: 'UBS', motivo_opcao: 'X' }, { studentName: 'Ana' });
    expect(titles(secs)).not.toContain('Justificativa do Encaminhamento');
    expect(titles(secs)).not.toContain('Orientações ao Serviço Receptor');
  });
});

// ─── Relatório de Evolução ───────────────────────────────────────────────────

describe('relatorioEvolucaoToSections', () => {
  it('escala como tabela + média; parecer; histórico só com 2+ registros', () => {
    const secs = relatorioEvolucaoToSections({
      scores: [4, 3, 5],
      observation: 'Boa evolução no semestre.',
      criteria: [{ name: 'Comunicação' }, { name: 'Interação' }, { name: 'Autonomia' }],
      history: [
        { date: '2026-03-01', scores: [3, 3, 4] },
        { date: '2026-06-01', scores: [4, 3, 5] },
      ],
    });
    expect(titles(secs)).toEqual([
      'Avaliação Multidimensional (Escala 1–5)',
      'Parecer Descritivo',
      'Histórico de Avaliações',
    ]);
    const escala = secs[0];
    expect(escala.fields[0].type).toBe('grid');
    expect(escala.fields.some(f => f.label === 'Média geral' && f.value === '4.0/5')).toBe(true);
  });

  it('sem histórico suficiente → sem seção de histórico', () => {
    const secs = relatorioEvolucaoToSections({
      scores: [4], observation: 'x', criteria: [{ name: 'C' }], history: [{ date: '2026-01-01', scores: [4] }],
    });
    expect(titles(secs)).not.toContain('Histórico de Avaliações');
  });
});
