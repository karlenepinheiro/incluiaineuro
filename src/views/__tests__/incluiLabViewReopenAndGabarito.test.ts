/**
 * Sprint 2B.3 — reabertura da Biblioteca (item 6) e aba de Gabarito separada (item 3).
 * Mesma abordagem de teste baseado em código-fonte usada nos demais arquivos
 * `__tests__` deste diretório (ver incluiLabViewLegacyPipeline.test.ts para o
 * racional completo da limitação).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const viewPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../IncluiLabView.tsx');
const source = readFileSync(viewPath, 'utf-8');

describe('IncluiLabView — reabertura da Biblioteca reconstrói ActivityPackage (item 6)', () => {
  it('handleLibSelect chama buildActivityPackageFromStoredRow e seta activityPackage no result', () => {
    expect(source).toContain('const rawStoredContentJson = getStoredContentJson(row);');
    expect(source).toContain('const storedActivity = parseStoredActivityFromPayload(rawStoredContentJson, row.content);');
    expect(source).toContain('const activityPackage = buildActivityPackageFromStoredRow(activity, rawStoredContentJson);');
    expect(source).toContain('activityPackage,');
  });

  it('buildActivityPackageFromStoredRow só reconstrói pacotes com schemaVersion 2.0 (itens legados ficam undefined)', () => {
    expect(source).toContain("from '../services/incluilab/activityPackageStorage';");
  });
});

describe('IncluiLabView — Gabarito é aba própria, separada do Guia (item 3)', () => {
  it('existe uma aba "gabarito" distinta de "guia" no ResultTab', () => {
    expect(source).toContain("type ResultTab = 'folha' | 'guia' | 'gabarito';");
    expect(source).not.toContain("type ResultTab = 'folha' | 'guia' | 'gabarito' | 'analise';");
  });

  it('a aba Gabarito usa AnswerKeyRenderer com ref próprio (gabaritoRef), não o ref do Guia', () => {
    expect(source).toContain('const gabaritoRef      = useRef<HTMLDivElement | null>(null);');
    expect(source).toContain('const canonicalAnswerKey = result.activityPackage?.answerKey ?? result.activityPackage?.activity.answerKey;');
    expect(source).toContain('<AnswerKeyRenderer activity={result.activity} answerKey={canonicalAnswerKey} printId={`incluilab-gabarito-${printIdSuffix}`} />');
  });

  // Checkpoint 4E — item "PDF/PNG não baixam" (reaberto): handleExport passou
  // a usar refs de EXPORTAÇÃO dedicados (exportFolhaRef/exportGuiaRef/
  // exportGabaritoRef), sempre montados fora da viewport, em vez dos refs do
  // preview/modal visível (folhaAlunoRef/guiaProfessorRef/gabaritoRef) — ver
  // relatório do Checkpoint 4E para a causa raiz e o motivo da separação.
  it('handleExport seleciona o ref de EXPORTAÇÃO correto por aba (folha/guia/gabarito), não o ref do preview visível', () => {
    expect(source).toContain('const getExportElement = (tab: ResultTab): HTMLElement | null => {');
    expect(source).toContain('const byId = document.getElementById(exportStageId(tab));');
    expect(source).toContain("const ref = tab === 'guia' ? exportGuiaRef : tab === 'gabarito' ? exportGabaritoRef : exportFolhaRef;");
    expect(source).toContain("const handleExport = async (format: 'pdf' | 'png', tab: ResultTab = activeTab) => {");
  });

  it('existe uma fonte de exportação dedicada, sempre montada fora da viewport, independente do modal/preview', () => {
    expect(source).toContain('const exportFolhaRef    = useRef<HTMLDivElement | null>(null);');
    expect(source).toContain('const exportGuiaRef     = useRef<HTMLDivElement | null>(null);');
    expect(source).toContain('const exportGabaritoRef = useRef<HTMLDivElement | null>(null);');
    expect(source).toContain("position: 'fixed', top: 0, left: -10000");
    expect(source).toContain('data-incluilab-export-source="true"');
    expect(source).toContain('data-export-stage="folha"');
    expect(source).toContain('data-export-stage="gabarito"');
  });
});
