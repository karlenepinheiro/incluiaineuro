/**
 * Checkpoint 4E — testes de regressão para as correções funcionais finais do
 * IncluiLAB (Gabarito em Avaliação, preservação de tipo original em adaptação,
 * título não vindo do filename, export com fonte dedicada, preview compacto).
 *
 * Mesma abordagem de teste-por-fonte usada em incluiLabViewLegacyPipeline.test.ts
 * (ver o comentário daquele arquivo para o racional completo): IncluiLabView.tsx
 * não é importável em ambiente `node` sem DOM — uma tentativa de import direto
 * nesta mesma sessão travou (timeout), confirmando o motivo já documentado.
 *
 * Onde a lógica é pura e pequena o bastante (regex de detecção), duplicamos o
 * padrão aqui para um teste comportamental real, em vez de só verificar que o
 * texto existe no arquivo — deixando explícito que isso espelha a implementação
 * e precisa ser atualizado junto se o regex de origem mudar.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const viewPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../IncluiLabView.tsx');
const source = readFileSync(viewPath, 'utf-8');

describe('Checkpoint 4E — Avaliação exige Gabarito', () => {
  it('reaproveita AVALIACAO_KEYWORDS do intentExtractor (não duplica a lista)', () => {
    expect(source).toContain("import { AVALIACAO_KEYWORDS } from '../services/incluilab/intentExtractor';");
    expect(source).toContain('function topicRequestsAvaliacao(topic: string): boolean {');
    expect(source).toContain('AVALIACAO_KEYWORDS.some(k => lower.includes(k))');
  });

  it('o contrato JSON exige "gabarito" quando o tema indica avaliação', () => {
    expect(source).toContain('const isAvaliacao = topicRequestsAvaliacao(topic);');
    expect(source).toContain('"gabarito": [');
    expect(source).toContain('e OBRIGATORIO e deve conter exatamente um item por numero de questao');
  });

  it('generateA4Economica extrai o gabarito do JSON sem fabricar nada quando ausente', () => {
    const start = source.indexOf('async function generateA4Economica(');
    const end = source.indexOf('async function generateA4EconomicaCanonical(');
    const body = source.slice(start, end);
    expect(body).toContain('let legacyAnswerKey: IncluiLabAnswerKeyItem[] | undefined;');
    expect(body).toContain("if (!legacyAnswerKey.length) legacyAnswerKey = undefined;");
    expect(body).toContain('legacyAnswerKey,');
  });

  it('hasGabarito reconhece tanto o gabarito canônico quanto o legado', () => {
    expect(source).toContain('const canonicalAnswerKey = result.activityPackage?.answerKey ?? result.activityPackage?.activity.answerKey;');
    expect(source).toContain('!!(canonicalAnswerKey?.length && result.activity) || !!result.legacyAnswerKey?.length');
  });

  // Espelha topicRequestsAvaliacao — mantenha em sincronia se a lógica de origem mudar.
  it('[comportamental] a heurística de palavra-chave reconhece avaliação/prova/teste e ignora temas neutros', () => {
    const AVALIACAO_KEYWORDS = ['avaliação', 'avaliacao', 'prova', 'teste', 'avaliativa', 'avaliativo', 'simulado'];
    const topicRequestsAvaliacao = (topic: string) => AVALIACAO_KEYWORDS.some(k => topic.toLowerCase().includes(k));
    expect(topicRequestsAvaliacao('Prova de frações para o 6º ano')).toBe(true);
    expect(topicRequestsAvaliacao('Avaliação de ciências sobre o sistema solar')).toBe(true);
    expect(topicRequestsAvaliacao('10 questões sobre frações')).toBe(false);
  });
});

describe('Checkpoint 4E — Adaptação preserva o tipo original', () => {
  it('exporta OriginalActivityType, labels e detectOriginalActivityType', () => {
    expect(source).toContain("export type { OriginalActivityType } from '../types';");
    expect(source).toContain('export const ORIGINAL_ACTIVITY_TYPE_LABELS: Record<OriginalActivityType, string> = {');
    expect(source).toContain('export function detectOriginalActivityType(analysisText: string): OriginalActivityType | null {');
    expect(source).toContain("table:           'tabela'");
  });

  it('sinaliza honestamente quando o renderer não suporta o tipo detectado (sem mascarar limitação)', () => {
    expect(source).toContain('export function rendererSupportsOriginalType(type: OriginalActivityType | null): boolean {');
    expect(source).toContain('const showOriginalTypeUnsupportedNotice = !!(');
    expect(source).toContain('este formato ainda não é totalmente suportado pelo editor do IncluiLAB');
  });

  it('generateAdaptarEconomico detecta o tipo original e propaga para o prompt e para o result', () => {
    const start = source.indexOf('async function generateAdaptarEconomico(');
    const end = source.indexOf('async function generateAdaptarVisual(');
    const body = source.slice(start, end);
    expect(body).toContain('const originalActivityType = detectOriginalActivityType(analysisText);');
    expect(body).toContain('buildPremiumAdaptActivityPrompt(analysisText, studentCtx, extraInstructions, originalActivityType)');
    expect(body).toContain('originalActivityType,');
  });

  it('o prompt contém a regra forte de preservação de estrutura, no texto pedido, quando há tipo original', () => {
    expect(source).toContain('Nao transforme um caca-palavras, cruzadinha, atividade de ligar, completar, colorir ou outro formato');
  });

  // Espelha detectOriginalActivityType — mantenha em sincronia se o regex mudar.
  it('[comportamental] detecta caça-palavras e múltipla escolha a partir do texto de análise', () => {
    const detect = (analysisText: string): string | null => {
      const t = (analysisText || '').toLowerCase();
      if (!t.trim()) return null;
      if (/ca[çc]a[\s-]?palavras/.test(t)) return 'word_search';
      if (/tabela|quadro\s+de\s+respostas|complete\s+a\s+tabela|preencha\s+a\s+tabela/.test(t)) return 'table';
      if (/m[uú]ltipla\s+escolha|alternativas?\b/.test(t)) return 'multiple_choice';
      return null;
    };
    expect(detect('A imagem mostra um caça-palavras com 10 palavras escondidas sobre animais.')).toBe('word_search');
    expect(detect('A imagem mostra uma tabela para completar com numerador e denominador.')).toBe('table');
    expect(detect('Trata-se de uma atividade de múltipla escolha com 4 alternativas por questão.')).toBe('multiple_choice');
    expect(detect('Um texto qualquer sem pista de formato.')).toBe(null);
  });
});

describe('Checkpoint 4E — Título não vem mais do filename cru', () => {
  it('exporta deriveAdaptedFallbackTitle e generateAdaptarEconomico o usa em vez do filename cru', () => {
    expect(source).toContain('export function deriveAdaptedFallbackTitle(analysisText: string, fileName: string): string {');
    expect(source).not.toContain("title: `Atividade Adaptada: ${file.name}`, prompt: extraInstructions, grade: anoSerie");
    const start = source.indexOf('async function generateAdaptarEconomico(');
    const end = source.indexOf('async function generateAdaptarVisual(');
    const body = source.slice(start, end);
    expect(body).toContain('const fallbackTitle = deriveAdaptedFallbackTitle(analysisText, file.name);');
    expect(body).toContain("normalizeIncluiLabActivity(cleanedAdapt, { title: fallbackTitle,");
  });

  // Espelha deriveAdaptedFallbackTitle — mantenha em sincronia se a lógica de origem mudar.
  it('[comportamental] prioriza título explícito da análise e só sanitiza o filename como último recurso', () => {
    const sanitizeFileNameForTitle = (fileName: string): string => {
      const withoutExt = (fileName || '').replace(/\.[a-zA-Z0-9]{2,5}$/, '');
      const spaced = withoutExt.replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ').trim();
      if (!spaced) return 'Atividade Adaptada';
      return spaced.replace(/\b\w/g, c => c.toUpperCase());
    };
    const derive = (analysisText: string, fileName: string): string => {
      const explicit = (analysisText || '').match(/t[íi]tulo\s*[:\-]\s*([^\n]{4,90})/i);
      if (explicit) {
        const candidate = explicit[1].trim().replace(/["'*_#]/g, '').trim();
        if (candidate.length >= 4) return candidate;
      }
      const firstLine = (analysisText || '')
        .split('\n')
        .map(l => l.replace(/^[-*#\s]+/, '').trim())
        .find(l => l.length >= 6 && l.length <= 90 && !/^t[íi]tulo\s*[:\-]/i.test(l));
      if (firstLine) return firstLine;
      return sanitizeFileNameForTitle(fileName);
    };
    expect(derive('Título: Caça-palavras dos animais\nConteúdo...', 'atividade_final_versao2.pdf')).toBe('Caça-palavras dos animais');
    expect(derive('', 'atividade_final_versao2.pdf')).toBe('Atividade Final Versao2');
    expect(derive('', 'atividade_final_versao2.pdf')).not.toBe('atividade_final_versao2.pdf');
  });
});

describe('Checkpoint 4E — Preview compacto + Visualizar', () => {
  it('usa o Dialog compartilhado do projeto para "Visualizar", não uma expansão inline', () => {
    expect(source).toContain("import { Dialog, DialogContent, DialogTitle } from '../components/ui/dialog';");
    expect(source).toContain('const [viewerOpen, setViewerOpen] = useState(false);');
    expect(source).toContain('<Dialog open={viewerOpen} onOpenChange={setViewerOpen}>');
  });

  it('o card compacto não renderiza mais a folha A4 inteira por padrão', () => {
    expect(source).toContain('Atividade pronta');
    // A Etapa 4D tinha um botão "Ver atividade completa" que expandia a folha
    // inline; a Checkpoint 4E removeu esse botão (só resta uma menção em
    // comentário explicando a história da correção — por isso o teste checa o
    // JSX do botão, não a frase solta, que ainda aparece no comentário acima).
    expect(source).not.toContain('<ChevronDown size={14} /> Ver atividade completa');
    expect(source).not.toContain('const [resultExpanded, setResultExpanded] = useState(false);');
  });
});

describe('Checkpoint 4E — Export com fonte dedicada', () => {
  it('a fonte de exportação monta folha/guia/gabarito ao mesmo tempo, fora da viewport', () => {
    expect(source).toContain('data-incluilab-export-source="true"');
    expect(source).toContain('{renderFolhaStage(exportFolhaRef)}');
    expect(source).toContain('data-export-stage="guia"');
    expect(source).toContain('{renderGuiaStage(exportGuiaRef)}');
    expect(source).toContain('data-export-stage="gabarito"');
    expect(source).toContain("{renderGabaritoStage(exportGabaritoRef, 'export')}");
    expect(source).toContain("position: 'fixed', top: 0, left: -10000");
  });

  it('o botão principal exporta a folha explicitamente quando o formato solicitado é PDF ou PNG', () => {
    expect(source).toContain("return handleExport('pdf', 'folha');");
    expect(source).toContain("return handleExport('png', 'folha');");
    expect(source).toContain('const handlePrimaryExport = async () => {');
    expect(source).toContain('selectedConnected: element?.isConnected');
  });
});

describe('Checkpoint 4E — Análise fora da UI normal', () => {
  it('ResultTab não expõe mais aba de análise no modal de resultado', () => {
    expect(source).toContain("type ResultTab = 'folha' | 'guia' | 'gabarito';");
    expect(source).not.toContain('<TabBtn id="analise"');
    expect(source).not.toContain("activeTab === 'analise'");
  });
});
