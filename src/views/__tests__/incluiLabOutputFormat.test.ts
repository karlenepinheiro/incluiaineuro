import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(path.resolve(__dirname, '../IncluiLabView.tsx'), 'utf8');

describe('IncluiLabView — formato de saída por pedido natural', () => {
  it('pausa pedidos canônicos sem outputFormat e pergunta Word/PDF/Imagem', () => {
    expect(source).toContain('pendingFormatRequest');
    expect(source).toContain('Em qual formato você quer receber a atividade?');
    expect(source).toContain("onChoose('docx')");
    expect(source).toContain("onChoose('pdf')");
    expect(source).toContain("onChoose('png')");
    expect(source).toContain("previewIntent.outputFormat === 'unspecified'");
    expect(source).toContain('return;');
  });

  it('preserva o pedido original ao escolher formato e segue a geração canônica', () => {
    expect(source).toContain('interface PendingFormatRequest');
    expect(source).toContain('inputText: string;');
    expect(source).toContain('file: AttachedFile | null;');
    expect(source).toContain('setPendingFormatRequest({ mode: effectiveMode, topic, inputText: inputText.trim(), file: pendingFile })');
    expect(source).toContain('void runGeneration(pending.mode, pending.topic, format, pending.inputText, pending.file)');
  });

  it('disponibiliza Word a partir do activityPackage, inclusive Biblioteca/reabertura', () => {
    expect(source).toContain('exportIncluiLabActivityToWord');
    expect(source).toContain('buildIncluiLabWordFilename');
    expect(source).toContain('downloadWordDocument');
    expect(source).toContain('activityPackage?.exportSettings.outputFormat');
    expect(source).toContain('outputFormat: activityPackage?.exportSettings.outputFormat');
    expect(source).toContain('Formato solicitado: {outputFormatLabel(result.outputFormat)}');
    expect(source).toContain('Baixar Word');
  });

  it('botão Word do card e botão Word do modal usam o mesmo handler primário', () => {
    const primaryCalls = source.match(/onClick=\{\(\) => void handlePrimaryExport\(\)\}/g) ?? [];
    expect(primaryCalls.length).toBeGreaterThanOrEqual(2);
    expect(source).toContain("if (result.outputFormat === 'docx') return handleExportWord();");
    expect(source).toContain('const blob = await exportIncluiLabActivityToWord(result.activityPackage');
    expect(source).toContain('downloadWordDocument(blob, buildIncluiLabWordFilename(result.activityPackage))');
  });

  it('respeita saída única: não mostra botões paralelos Word/PDF/PNG como ações principais', () => {
    expect(source).toContain('const handlePrimaryExport = async () => {');
    expect(source).toContain("if (result.outputFormat === 'docx') return handleExportWord();");
    expect(source).toContain("if (result.outputFormat === 'png') return handleExport('png', 'folha');");
    expect(source).toContain("return handleExport('pdf', 'folha');");
    expect(source).not.toContain("result.outputFormat !== 'docx'");
    expect(source).not.toContain("result.outputFormat !== 'pdf'");
    expect(source).not.toContain("result.outputFormat !== 'png'");
  });

  it('PDF e PNG continuam usando o export existente', () => {
    expect(source).toContain("return handleExport('pdf', 'folha')");
    expect(source).toContain("return handleExport('png', 'folha')");
    expect(source).toContain('exportAsPDF(element');
    expect(source).toContain('exportAsPNG(element');
  });
});
