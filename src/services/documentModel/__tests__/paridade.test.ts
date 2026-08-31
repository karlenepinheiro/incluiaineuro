/**
 * paridade.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * [CORREÇÃO FINAL DA FASE 2] Auditoria automática de PARIDADE de conteúdo entre
 * tela final, PDF, Word e Google Docs, com valores SENTINELA únicos por campo.
 *
 * - Perfil Inteligente: cada campo FINAL recebe um sentinel único; o teste
 *   confirma que todo sentinel aparece no `document.xml` do Word; e que os
 *   campos internos/não-publicados NÃO aparecem em nenhum lugar.
 * - Documentos cujo PDF e Word saem do MESMO adaptador (via `pdfFromSections`):
 *   a paridade estrutural é por construção — verificada aqui lendo o código-fonte
 *   dos componentes de linha (todos passam `pdfFromSections: true`).
 * - Google Docs: o Blob enviado ao Drive é, por contrato do
 *   `useFormalDocumentExport`, o retorno de `exportGenericDocumentToWord` — o
 *   mesmo do botão "Baixar Word". Coberto por documentExportCanonical /
 *   googleDriveExportService.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import PizZip from 'pizzip';
import { describe, expect, it } from 'vitest';
import type { Student } from '../../../types';
import { exportGenericDocumentToWord } from '../../wordExportService';
import {
  intelligentProfileToSections,
  intelligentProfileTitle,
  INTELLIGENT_PROFILE_DOC_SECTIONS,
  INTELLIGENT_PROFILE_FIELD_CLASSIFICATION,
} from '../intelligentProfile';

const student = { name: 'Aluno Paridade', grade: '5º ano', shift: 'Manhã', schoolName: 'EM Teste' } as Student;

async function docXml(blob: Blob): Promise<string> {
  const zip = new PizZip(Buffer.from(await blob.arrayBuffer()));
  return zip.file('word/document.xml')!.asText();
}

// Perfil com sentinela único por campo FINAL.
const S = (k: string) => `SENTINELA_${k}_9Z`;
const profileSentinel: any = {
  studentName: S('studentName'), generatedAt: '2026-08-01T10:00:00Z', generatedBy: S('generatedBy'), version: 2,
  firstPersonLetter: S('firstPersonLetter'),
  humanizedIntroduction: { title: 'x', text: S('humanizedIntroductionText') },
  pedagogicalReport: { text: S('pedagogicalReportText'), checklist: [{ label: S('pedChecklistLabel'), status: 'presente' }] },
  neuroPedagogicalReport: { text: S('neuroPedReportText'), checklist: [{ label: S('npdChecklistLabel'), status: 'em_desenvolvimento' }] },
  strengths: [S('strengths0')],
  bestLearningStrategies: { text: S('blsTextINTERNO'), items: [S('blsItem0')] },
  challenges: [{ title: S('challengeTitle'), description: S('challengeDesc') }],
  recommendedActivities: [{ title: S('actTitle'), objective: S('actObjective'), howToApply: S('actHowTo'), whyItHelps: S('actWhy'), supportLevel: 'Médio', incluiLabPrompt: S('actPromptINTERNO') }],
  observationPoints: { text: S('obsText'), checklist: [S('obsChecklist0')] },
  // Campos NÃO publicados:
  neuropsychologicalReport: { text: S('npsTextINTERNO'), checklist: [S('npsChecklistINTERNO')] },
  learningProfile: { text: S('learningProfileINTERNO'), attentionSpan: S('attentionSpanINTERNO') },
  nextSteps: [S('nextStepsINTERNO')],
  sourcesConsidered: [S('sourcesConsideredINTERNO')],
  changesSinceLastVersion: S('changesSinceLastVersionINTERNO'),
};

describe('Perfil Inteligente — paridade tela/PDF/Word (sentinelas)', () => {
  it('as seções do adaptador são exatamente as do documento final, na ordem', () => {
    expect(intelligentProfileToSections(profileSentinel).map(s => s.title))
      .toEqual([...INTELLIGENT_PROFILE_DOC_SECTIONS]);
  });

  it('TODO sentinel de campo FINAL aparece no document.xml do Word', async () => {
    const xml = await docXml(await exportGenericDocumentToWord({
      title: intelligentProfileTitle(2), data: { sections: intelligentProfileToSections(profileSentinel) }, student, auditCode: 'REG-P1',
    }));
    for (const s of [
      'firstPersonLetter', 'pedagogicalReportText', 'pedChecklistLabel',
      'neuroPedReportText', 'npdChecklistLabel', 'strengths0', 'blsItem0',
      'challengeTitle', 'challengeDesc', 'actTitle', 'actObjective', 'actHowTo', 'actWhy',
      'obsText', 'obsChecklist0', 'studentName', 'generatedBy',
    ]) {
      expect(xml, `sentinel FINAL ausente: ${s}`).toContain(S(s));
    }
  });

  it('NENHUM sentinel de campo interno/não-publicado aparece no document.xml', async () => {
    const xml = await docXml(await exportGenericDocumentToWord({
      title: intelligentProfileTitle(2), data: { sections: intelligentProfileToSections(profileSentinel) }, student, auditCode: 'REG-P1',
    }));
    for (const s of [
      'npsTextINTERNO', 'npsChecklistINTERNO', 'learningProfileINTERNO', 'attentionSpanINTERNO',
      'nextStepsINTERNO', 'sourcesConsideredINTERNO', 'changesSinceLastVersionINTERNO',
      'blsTextINTERNO', 'actPromptINTERNO',
    ]) {
      expect(xml, `sentinel INTERNO vazou: ${s}`).not.toContain(S(s));
    }
  });

  it('a classificação declara motivo para cada campo não-publicado', () => {
    const naoPublicados = Object.entries(INTELLIGENT_PROFILE_FIELD_CLASSIFICATION)
      .filter(([, c]) => !c.publicaNoDocumento);
    expect(naoPublicados.length).toBeGreaterThanOrEqual(4);
    for (const [, c] of naoPublicados) expect(c.motivo.length).toBeGreaterThan(20);
  });
});

// ─── Paridade estrutural PDF↔Word dos documentos com adaptador único ─────────

describe('Documentos com adaptador único: PDF e Word saem da MESMA fonte', () => {
  const ROOT = path.resolve(__dirname, '../../..');
  const ROWS_WITH_SHARED_ADAPTER = [
    'components/fichas/ServiceRecordExportRow.tsx',
    'components/fichas/PlanoAcaoExportRow.tsx',
    'components/fichas/ChecklistExportRow.tsx',
    'components/fichas/CareRoutineExportRow.tsx',
    'components/fichas/BibliotecaExportRow.tsx',
  ];

  it.each(ROWS_WITH_SHARED_ADAPTER)('%s usa pdfFromSections (PDF gerado do mesmo getSections do Word)', async (rel) => {
    const src = await fs.readFile(path.join(ROOT, rel), 'utf8');
    expect(src).toMatch(/pdfFromSections:\s*true/);
    expect(src).toMatch(/getSections/);
  });

  it('useFormalDocumentExport: quando pdfFromSections, PDF vem de generateFromSections(getSections())', async () => {
    const src = await fs.readFile(path.join(ROOT, 'components/document-workspace/useFormalDocumentExport.ts'), 'utf8');
    expect(src).toMatch(/pdfFromSections\s*\?\s*downloadPdfFromSections/);
    expect(src).toMatch(/generateFromSections/);
    // Word (e o Blob do Google Docs) usam exportGenericDocumentToWord(getSections())
    expect(src).toMatch(/exportGenericDocumentToWord/);
    expect(src).toMatch(/generateDocxBlob/);
  });
});
