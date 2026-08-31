import PizZip from 'pizzip';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadWordDocument, exportIncluiLabActivityToWord } from '../wordExportService';
import type { ActivityExercise, ActivityPackage } from '../../types';

function makePackage(requestType: ActivityPackage['metadata']['requestType'], exercises: ActivityExercise[]): ActivityPackage {
  const answerKey = requestType === 'avaliacao'
    ? exercises.map(exercise => ({ exerciseId: exercise.id, answer: `Resposta ${exercise.id}` }))
    : undefined;

  return {
    activity: {
      schemaVersion: '2.0',
      requestType,
      header: {
        title: requestType === 'avaliacao' ? 'Avaliação de Frações' : requestType === 'adaptacao' ? 'Caça-palavras Adaptado' : 'Água',
        theme: 'Ciências',
        objective: 'Resolver a atividade proposta',
        level: '7º ano',
        estimatedTime: '30 minutos',
        instructions: ['Leia com atenção.'],
      },
      blocks: [{
        id: 'base-text-1',
        type: 'instructions',
        title: 'Texto introdutório',
        content: 'A água é essencial para a vida e está presente em diferentes ambientes.',
        items: [],
        visualAssetIds: [],
      }],
      exercises,
      visualAssets: [],
      accessibilityNotes: { supports: [], adaptations: [], teacherNotes: [] },
      answerKey,
      guia_pedagogico: requestType === 'adaptacao'
        ? {
            objetivo_da_aula: 'Preservar a estrutura da atividade original.',
            metodologia_adaptada: 'Aplicar com mediação por etapas.',
            dicas_de_mediacao: ['Ler as pistas com o aluno.'],
            criterios_de_avaliacao: ['Observar participação.'],
            materiais_necessarios: ['Lápis'],
            tempo_estimado: '30 minutos',
            adaptacoes_inclusivas: ['Redução de carga visual.'],
          }
        : undefined,
    },
    teacherGuide: requestType === 'adaptacao'
      ? {
          objetivo_da_aula: 'Preservar a estrutura da atividade original.',
          metodologia_adaptada: 'Aplicar com mediação por etapas.',
          dicas_de_mediacao: ['Ler as pistas com o aluno.'],
          criterios_de_avaliacao: ['Observar participação.'],
          materiais_necessarios: ['Lápis'],
          tempo_estimado: '30 minutos',
          adaptacoes_inclusivas: ['Redução de carga visual.'],
        }
      : undefined,
    answerKey,
    visualAssets: [],
    metadata: {
      schemaVersion: '2.0',
      requestType,
      generatedAt: '2026-08-20T00:00:00.000Z',
      repairAttempts: 0,
      visualMode: 'none',
      visualModeSource: 'inferred_default',
      studentContextUsed: requestType === 'adaptacao',
    },
    exportSettings: { pageSize: 'A4', visualStyle: 'fundamental', outputFormat: 'docx' },
  };
}

async function readDocumentXml(pkg: ActivityPackage): Promise<string> {
  const blob = await exportIncluiLabActivityToWord(pkg, {
    studentName: 'Aluno Teste',
    generatedAt: new Date('2026-08-20T00:00:00.000Z'),
  });
  const zip = new PizZip(await blob.arrayBuffer());
  return zip.file('word/document.xml')?.asText() ?? '';
}

describe('exportIncluiLabActivityToWord', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('gera atividade geral com texto-base e 15 questões sem Guia', async () => {
    const exercises = Array.from({ length: 15 }, (_, index): ActivityExercise => ({
      id: `exercise-${index + 1}`,
      type: index % 2 ? 'multiple_choice' : 'short_answer',
      title: `Questão ${index + 1}`,
      prompt: `Enunciado ${index + 1}`,
      options: index % 2 ? ['A', 'B', 'C', 'D'] : [],
      answerLines: 3,
    }));
    const xml = await readDocumentXml(makePackage('atividade', exercises));

    expect(xml).toContain('Texto introdutório');
    expect(xml).toContain('Questão 15');
    expect(xml).not.toContain('Guia do Professor');
    expect(xml).not.toContain('Gabarito');
  });

  it('gera avaliação com Folha do Aluno e Gabarito no mesmo DOCX', async () => {
    const xml = await readDocumentXml(makePackage('avaliacao', [{
      id: 'exercise-1',
      type: 'multiple_choice',
      title: 'Questão 1',
      prompt: 'Quanto é 1/2 + 1/2?',
      options: ['1', '2', '3', '4'],
      answerLines: 0,
    }]));

    expect(xml).toContain('Avaliação de Frações');
    expect(xml).toContain('Gabarito');
    expect(xml).toContain('Resposta exercise-1');
    expect(xml).not.toContain('Guia do Professor');
  });

  it('gera adaptação com Guia e preserva estruturas no Word', async () => {
    const structuralTypes: ActivityExercise[] = [
      { id: 'ws', type: 'word_search', title: 'Caça-palavras', prompt: 'Encontre as palavras.', options: ['SOL', 'LUA'], answerLines: 0, grid: ['SOLX', 'ALUA'] },
      { id: 'cw', type: 'crossword', title: 'Cruzadinha', prompt: 'Complete a cruzadinha.', options: ['RIO'], answerLines: 0, clues: ['Água que corre'] },
      { id: 'mt', type: 'matching', title: 'Ligue', prompt: 'Ligue os pares.', options: ['Sol', 'Dia'], answerLines: 0 },
      { id: 'fb', type: 'fill_blank', title: 'Complete', prompt: 'A água é _____.', options: ['vida'], answerLines: 2 },
      { id: 'co', type: 'coloring', title: 'Colorir', prompt: 'Colorir a gota.', options: [], answerLines: 0 },
      { id: 'tb', type: 'table', title: 'Tabela', prompt: 'Complete a tabela.', options: ['Uso da água'], answerLines: 0 },
    ];
    const xml = await readDocumentXml(makePackage('adaptacao', structuralTypes));

    expect(xml).toContain('Caça-palavras');
    expect(xml).toContain('Cruzadinha');
    expect(xml).toContain('Ligue');
    expect(xml).toContain('Complete');
    expect(xml).toContain('Colorir');
    expect(xml).toContain('Tabela');
    expect(xml).toContain('<w:tbl>');
    expect(xml).toContain('Guia do Professor');
    expect(xml).not.toContain('short_answer');
  });

  it('cria Blob DOCX não vazio e ZIP/XML válido', async () => {
    const pkg = makePackage('adaptacao', [{
      id: 'exercise-1',
      type: 'short_answer',
      title: 'Questão 1',
      prompt: 'Explique a ideia central.',
      options: [],
      answerLines: 3,
    }]);

    const blob = await exportIncluiLabActivityToWord(pkg);
    const zip = new PizZip(await blob.arrayBuffer());

    expect(blob.size).toBeGreaterThan(1000);
    expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    expect(zip.file('[Content_Types].xml')).toBeTruthy();
    expect(zip.file('word/document.xml')?.asText()).toContain('Guia do Professor');
  });

  it('download cria URL temporária, usa extensão .docx e revoga após o clique', () => {
    vi.useFakeTimers();
    const click = vi.fn();
    const appendChild = vi.fn();
    const removeChild = vi.fn();
    const anchor: any = { click };
    const createObjectURL = vi.fn(() => 'blob:docx-url');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    vi.stubGlobal('document', {
      createElement: vi.fn(() => anchor),
      body: { appendChild, removeChild },
    });
    vi.stubGlobal('window', { setTimeout });

    downloadWordDocument(new Blob(['docx-content']), 'atividade:adaptada');

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(anchor.href).toBe('blob:docx-url');
    expect(anchor.download).toBe('atividade_adaptada.docx');
    expect(appendChild).toHaveBeenCalledWith(anchor);
    expect(click).toHaveBeenCalledTimes(1);
    expect(removeChild).toHaveBeenCalledWith(anchor);
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:docx-url');
    vi.useRealTimers();
  });

  it('Word contém Folha do Aluno, Guia compacto e remove tokens Markdown', async () => {
    const exercises = Array.from({ length: 10 }, (_, index): ActivityExercise => ({
      id: `exercise-${index + 1}`,
      type: 'short_answer',
      title: `Questão **${index + 1}**`,
      prompt: 'Explique a palavra **cultura** usando `palavras-chave`.',
      options: [],
      answerLines: 2,
    }));
    const pkg = makePackage('adaptacao', exercises);
    pkg.activity.blocks[0].content = '# Texto\nA **cultura** aparece em diferentes contextos. '.repeat(35);
    pkg.teacherGuide = {
      objetivo_da_aula: 'Preservar o objetivo de compreender cultura em diferentes contextos sociais e escolares.',
      metodologia_adaptada: '1. Apresente o texto em partes. 2. Leia um comando por vez. 3. Use palavras-chave. 4. Faça pausa. 5. Retome a estratégia.',
      dicas_de_mediacao: ['Permita resposta oral, seleção ou palavras-chave.', 'Não entregue a resposta durante a mediação.'],
      criterios_de_avaliacao: ['Observar compreensão de cultura.', 'Registrar nível de ajuda.'],
      materiais_necessarios: ['Lápis'],
      tempo_estimado: '30 minutos',
      adaptacoes_inclusivas: ['Texto segmentado.', 'Comandos curtos.', 'Pausa entre Parte 1 e Parte 2.'],
    };
    pkg.activity.guia_pedagogico = pkg.teacherGuide;

    const xml = await readDocumentXml(pkg);

    expect(xml).toContain('Parte 1');
    expect(xml).toContain('Parte 2');
    expect(xml).toContain('Pausa curta');
    expect(xml).toContain('Questão 10');
    expect(xml).toContain('Objetivo da atividade');
    expect(xml).toContain('Adaptações aplicadas');
    expect(xml).toContain('Como aplicar');
    expect(xml).toContain('Apoios e formas de resposta');
    expect(xml).toContain('O que observar');
    expect(xml).not.toContain('**cultura**');
    expect(xml).not.toContain('`palavras-chave`');
    expect(xml).not.toContain('# Texto');
  });
});
