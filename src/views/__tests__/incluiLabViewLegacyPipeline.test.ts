/**
 * Teste de regressão baseado em código-fonte (não em renderização).
 *
 * IncluiLabView.tsx é um componente grande com funções internas não exportadas,
 * não isolável para teste unitário convencional sem uma refatoração ampla do
 * arquivo — refatoração explicitamente fora do escopo do Sprint 2B (item 19).
 *
 * Este teste garante, de forma pragmática, que o Sprint 2B não removeu nem
 * substituiu o pipeline legado: as seis funções de geração originais continuam
 * presentes, e o roteamento em `runGeneration` só desvia para o pipeline
 * canônico quando o modo estiver habilitado em incluilabPipeline.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const viewPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../IncluiLabView.tsx');
const source = readFileSync(viewPath, 'utf-8');

describe('IncluiLabView — pipeline legado permanece acessível (Sprint 2B)', () => {
  it('mantém as seis funções de geração legadas', () => {
    for (const marker of [
      'async function generateA4Economica(',
      'async function generateA4Visual(',
      'async function generateA4Premium(',
      'async function generateAdaptarEconomico(',
      'async function generateAdaptarVisual(',
      'async function generateAdaptarPremium(',
    ]) {
      expect(source).toContain(marker);
    }
  });

  it('runGeneration desvia somente os modos textuais habilitados para o pipeline canônico', () => {
    expect(source).toContain(
      "case 'a4_economica':      await (isIncluiLabCanonicalModeEnabled('a4_economica') ? generateA4EconomicaCanonical(topic, outputFormatHint) : generateA4Economica(topic)); break;",
    );
    expect(source).toContain(
      "case 'avaliacao':         await (isIncluiLabCanonicalModeEnabled('avaliacao') ? generateAvaliacaoCanonical(topic, outputFormatHint) : generateA4Economica(`Avaliação: ${topic}`)); break;",
    );
    expect(source).toContain(
      "isIncluiLabCanonicalModeEnabled('adaptar_economico') ? generateAdaptarEconomicoCanonical(fileForGeneration, extras, outputFormatHint) : generateAdaptarEconomico(fileForGeneration, extras)",
    );
  });

  it('rollback segmentado dos três modos textuais volta para o legado quando a flag do modo é false', () => {
    expect(source).toContain("isIncluiLabCanonicalModeEnabled('a4_economica') ? generateA4EconomicaCanonical(topic, outputFormatHint) : generateA4Economica(topic)");
    expect(source).toContain("isIncluiLabCanonicalModeEnabled('avaliacao') ? generateAvaliacaoCanonical(topic, outputFormatHint) : generateA4Economica(`Avaliação: ${topic}`)");
    expect(source).toContain("isIncluiLabCanonicalModeEnabled('adaptar_economico') ? generateAdaptarEconomicoCanonical(fileForGeneration, extras, outputFormatHint) : generateAdaptarEconomico(fileForGeneration, extras)");
  });

  it('não altera o roteamento dos modos a4_visual/a4_premium/adaptar_visual/adaptar_premium', () => {
    expect(source).toContain("case 'a4_visual':         await generateA4Visual(topic); break;");
    expect(source).toContain("case 'a4_premium':        await generateA4Premium(topic); break;");
    expect(source).toContain("case 'adaptar_visual':    if (fileForGeneration) await generateAdaptarVisual(fileForGeneration, extras); break;");
    expect(source).toContain("case 'adaptar_premium':   if (fileForGeneration) await generateAdaptarPremium(fileForGeneration, extras); break;");
  });

  it('o chip "Criar relatório" foi removido das sugestões, mas não foi transformado em atividade forçada', () => {
    expect(source).not.toContain("label: 'Criar relatório'");
    expect(source).not.toContain("case 'Criar relatório'");
  });
});

/**
 * Checkpoint 4D — correções comprovadas por teste real no IncluiLAB.
 * Mesmo método de teste-por-fonte usado acima (ver comentário no topo do arquivo):
 * IncluiLabView.tsx continua não sendo importável em ambiente `node` (sem DOM) sem
 * risco de efeitos colaterais em nível de módulo — teste por regressão de código.
 */
describe('IncluiLabView — Checkpoint 4D (correções pós-teste real)', () => {
  it('generateA4Economica não fabrica mais Guia do Professor (bug: extractGuiaText sempre caía no fallback)', () => {
    const start = source.indexOf('async function generateA4Economica(');
    const end = source.indexOf('async function generateA4EconomicaCanonical(');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const body = source.slice(start, end);
    // ANTES: `const guiaText = extractGuiaText(parsedForGuia, topic);` seguido de
    // `guiaText,` no objeto passado a setResult — sempre truthy (buildFallbackGuide
    // nunca retorna vazio), então hasGuide ficava sempre true nesse modo.
    expect(body).not.toContain('extractGuiaText(parsedForGuia');
    expect(body).not.toMatch(/\bguiaText,/);
  });

  it('as seis funções de geração legadas chamam autoSavePersistedResult (autosave não existia para nenhuma delas)', () => {
    const legacyFns = [
      'generateA4Economica',
      'generateA4Visual',
      'generateA4Premium',
      'generateAdaptarEconomico',
      'generateAdaptarVisual',
      'generateAdaptarPremium',
    ];
    const canonicalMarkers = legacyFns.map(fn => `async function ${fn}Canonical(`);
    for (const fn of legacyFns) {
      const start = source.indexOf(`async function ${fn}(`);
      expect(start, `função ${fn} não encontrada`).toBeGreaterThan(-1);
      // Delimita o corpo até a próxima função de geração (canônica ou legada seguinte),
      // o que vier primeiro — evita capturar autoSavePersistedResult de outra função.
      const nextBoundaries = [...legacyFns, ...canonicalMarkers.map(m => m.replace('async function ', '').replace('(', ''))]
        .map(name => source.indexOf(`async function ${name}(`, start + 10))
        .filter(i => i > start);
      const end = nextBoundaries.length ? Math.min(...nextBoundaries) : source.length;
      const body = source.slice(start, end);
      expect(body, `${fn} deveria chamar autoSavePersistedResult`).toContain('autoSavePersistedResult(');
    }
  });

  it('exporta extractRequestedQuestionCount e o prompt de A4 Econômica usa quantityRule em vez do limite fixo antigo', () => {
    expect(source).toContain('export function extractRequestedQuestionCount(');
    expect(source).not.toContain('- Use 3 a 6 questoes no maximo, com enunciados curtos.');
    expect(source).toContain('${quantityRule}');
  });

  it('o overlay de exportação usa createPortal(document.body) — isola o DOM da árvore exportada pelo html2canvas', () => {
    expect(source).toContain("import { createPortal } from 'react-dom';");
    expect(source).toContain('exportBusy && createPortal(');
  });
});
