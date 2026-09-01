/**
 * genericWordExport.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * [FASE 2] Verifica, ponta a ponta, que exportGenericDocumentToWord produz um
 * .docx REAL (zip OOXML válido) a partir das seções de um adaptador — com todo
 * o conteúdo, na ordem certa, "Não informado" preservado, acentuação intacta,
 * tabelas de verdade, e MIME oficial do DOCX.
 *
 * Roda em `node` puro: os adaptadores emitem texto single-line + arrays + grid,
 * evitando o caminho de DOMParser do renderer.
 */
import PizZip from 'pizzip';
import { describe, expect, it } from 'vitest';
import type { Student } from '../../types';
import {
  buildGenericWordFilename,
  exportGenericDocumentToWord,
} from '../wordExportService';
import { relatorioTecnicoToSections } from '../documentModel/relatorioTecnico';
import { fichaToSections } from '../documentModel/ficha';
import { serviceRecordToSections, serviceRecordTitle } from '../documentModel/serviceRecord';
import { actionPlanAeeToSections, actionPlanAeeTitle } from '../documentModel/actionPlan';
import { careRoutineToSections, careRoutineTitle } from '../documentModel/careRoutine';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const student = { name: 'Maria Eduarda Souza', grade: '3º ano', shift: 'Manhã', schoolName: 'EM Teste' } as Student;

async function unzipDocumentXml(blob: Blob): Promise<string> {
  const buf = Buffer.from(await blob.arrayBuffer());
  const zip = new PizZip(buf);
  return zip.file('word/document.xml')!.asText();
}

describe('exportGenericDocumentToWord — .docx real', () => {
  it('Relatório Técnico (completo): zip OOXML válido, MIME correto, todas as seções na ordem, acentos e tabela', async () => {
    const sections = relatorioTecnicoToSections(
      {
        data: {
          tipo: 'completo',
          resumoExecutivo: 'Resumo do caso.',
          identificacao: 'Maria, 9 anos, 3º ano.',
          historicoRelevante: 'Sem intercorrências.',
          analisePedagogica: 'Avançando na leitura com apoio.',
          situacaoFuncional: '',
          perfilCognitivo: 'Raciocínio preservado.',
          dificuldades: ['Atenção sustentada', 'Organização'],
          potencialidades: ['Memória visual'],
          estrategiasEficazes: ['Rotina com pistas visuais'],
          checklist: [{ area: 'Linguagem', presente: true, grau: 'leve', obs: '' }],
          evolucaoObservada: 'Melhora gradual.',
          observacoesRelevantes: '',
          conclusao: 'Manter acompanhamento pedagógico.',
          recomendacoesPedagogicas: ['Tempo estendido'],
          recomendacoesClinicas: [],
          recomendacoesFamiliares: [],
          recomendacoesInstitucionais: [],
        } as any,
        codigoDoc: 'REG-XYZ789',
        geradoEm: '2026-08-10T10:00:00Z',
        geradoPor: 'Prof. Ana',
        rawText: '',
      },
      { scores: [4, 3, 5, 2, 4, 3, 4, 5, 3, 4] },
    );

    const blob = await exportGenericDocumentToWord({
      title: 'Relatório Técnico Pedagógico',
      data: { sections },
      student,
      auditCode: 'REG-XYZ789',
    });

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe(DOCX_MIME);
    expect(blob.size).toBeGreaterThan(1500);

    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(bytes[0]).toBe(0x50); // 'P'
    expect(bytes[1]).toBe(0x4b); // 'K'  → assinatura de zip

    const xml = await unzipDocumentXml(blob);
    // cabeçalho institucional
    expect(xml).toContain('Relatório Técnico Pedagógico');
    expect(xml).toContain('Maria Eduarda Souza');
    expect(xml).toContain('REG-XYZ789');
    // seções na ordem
    const idxResumo = xml.indexOf('Resumo Executivo');
    const idxConclusao = xml.indexOf('Conclusão e Parecer Técnico');
    const idxRecs = xml.indexOf('Recomendações Multidisciplinares');
    expect(idxResumo).toBeGreaterThan(0);
    expect(idxConclusao).toBeGreaterThan(idxResumo);
    expect(idxRecs).toBeGreaterThan(idxConclusao);
    // conteúdo + acentuação
    expect(xml).toContain('Avançando na leitura com apoio.');
    expect(xml).toContain('Atenção sustentada');
    // tabela de verdade (checklist de áreas / escala)
    expect(xml).toContain('<w:tbl>');
    // assinaturas
    expect(xml).toContain('Assinaturas');
  });

  it('Relatório Técnico (simples): "Não informado" chega ao .docx para campo vazio', async () => {
    const sections = relatorioTecnicoToSections({
      data: { tipo: 'simples', identificacao: 'X', situacaoFuncional: '', dificuldades: [], conclusao: 'Y', recomendacoes: [] } as any,
      codigoDoc: 'REG-1', geradoEm: '2026-08-10T10:00:00Z', geradoPor: 'P', rawText: '',
    });
    const xml = await unzipDocumentXml(await exportGenericDocumentToWord({
      title: 'Relatório Técnico Pedagógico', data: { sections }, student,
    }));
    expect(xml).toContain('Situação Funcional');
    expect(xml).toContain('Não informado');
  });

  it('Ficha (Escuta da Família): campos e escala no .docx', async () => {
    const sections = fichaToSections('Escuta da Família', [
      { label: 'Relato da Família', value: 'Boa evolução em casa.' },
      { label: 'Nível Geral', value: '4', isScale: true },
    ]);
    const xml = await unzipDocumentXml(await exportGenericDocumentToWord({
      title: 'Escuta da Família', data: { sections }, student, auditCode: 'FICHA-9',
    }));
    expect(xml).toContain('Campos de Observação — Escuta da Família');
    expect(xml).toContain('Boa evolução em casa.');
    expect(xml).toContain('4 / 5'); // escala renderizada
  });

  it('[Bloco B] Registro de Atendimento: .docx válido com todas as seções', async () => {
    const sections = serviceRecordToSections({
      id: 'r1', studentId: 's1', studentName: 'Maria', date: '2026-08-20', type: 'AEE',
      professional: 'Prof. Exemplo', duration: 50, attendance: 'Presente', observation: 'Boa sessão.',
      dailyChecklist: { desempenho: 6, interacao: 5, comportamento: 'adequado', progressoAtividade: 'Avançou.', estrategiasUsadas: 'Pistas visuais.', proximosPassos: 'Ampliar.' },
    } as any);
    const xml = await unzipDocumentXml(await exportGenericDocumentToWord({
      title: serviceRecordTitle(), data: { sections }, student, auditCode: 'REG-A1',
    }));
    expect(xml).toContain('Dados do Atendimento');
    expect(xml).toContain('Ficha Avaliativa Diária');
    expect(xml).toContain('Boa sessão.');
    expect(xml).toContain('Pistas visuais.');
  });

  it('[Bloco B] Plano de Ação AEE: blocos próprios do AEE no .docx', async () => {
    const mk = (t: string) => ({ title: t, items: [{ id: '1', text: `x de ${t}`, done: false }] });
    const sections = actionPlanAeeToSections({
      period: 'semanal', registrationNumber: 'REG-B1', version: 1, generatedBy: 'x', generatedByName: 'Prof', generatedAt: '2026-08-01T10:00:00Z',
      welcomeRoutine: mk('Acolhida'), priorityBarrier: mk('Barreira'), sessionScript: mk('Roteiro'),
      materials: mk('Materiais'), applicationGuide: mk('Como Aplicar'), responseRecord: mk('Registro'),
    } as any);
    const xml = await unzipDocumentXml(await exportGenericDocumentToWord({
      title: actionPlanAeeTitle(), data: { sections }, student, auditCode: 'REG-B1',
    }));
    expect(xml).toContain('Acolhida');
    expect(xml).toContain('Roteiro');
    expect(xml).not.toContain('Antes da Aula');
  });

  it('[Bloco B] Rotina da Cuidadora: tabela (rubric) + checklist no .docx', async () => {
    const sections = careRoutineToSections([
      { title: 'Tarde', order_index: 0, fields: [
        { label: 'Progresso', field_type: 'rubric', value: { 'Autonomia': 'Em progresso' }, options: { criteria: ['Autonomia'], levels: ['Iniciando', 'Em progresso', 'Atingido'] }, order_index: 0 },
        { label: 'Checklist saída', field_type: 'checklist', value: { checked: [0] }, options: { items: ['Pega mochila', 'Despede-se'] }, order_index: 1 },
      ] },
    ] as any);
    const xml = await unzipDocumentXml(await exportGenericDocumentToWord({
      title: careRoutineTitle(), data: { sections }, student, auditCode: 'REG-C1',
    }));
    expect(xml).toContain('<w:tbl>');
    expect(xml).toContain('Pega mochila');
    expect(xml).not.toContain('Despede-se'); // idx 1 não marcado
  });

  it('buildGenericWordFilename: legível, .docx, sem espaços', () => {
    const name = buildGenericWordFilename('Relatorio Tecnico', student, 'REG-XYZ789');
    expect(name.endsWith('.docx')).toBe(true);
    expect(name).not.toMatch(/\s/);
    expect(name).toContain('REG');
  });
});
