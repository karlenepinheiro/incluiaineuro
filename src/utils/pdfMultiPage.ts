/**
 * pdfMultiPage.ts — Leitura multipágina do Cadastro Inteligente (27/08/2026)
 *
 * Lógica PURA (sem pdfjs, sem canvas, sem DOM) do plano de páginas de um PDF
 * escaneado: quantas páginas existem, quantas serão efetivamente renderizadas
 * e enviadas (limite de 10), e as mensagens exibidas antes/depois do
 * processamento. Testável diretamente em qualquer ambiente — ver
 * src/utils/__tests__/pdfMultiPage.test.ts.
 *
 * A renderização de verdade (pdfjs + <canvas>, que exige navegador) vive em
 * `renderScannedPdfPages` (studentDocumentImportService.ts) e usa
 * `planMultiPagePdf`/`isImageDataLikelyBlank` daqui — a decisão de QUANTAS e
 * QUAIS páginas processar é sempre esta função pura, nunca decidida "inline"
 * dentro do código de renderização.
 */

/** Limite inicial oficial desta fase: no máximo 10 páginas por análise visual. */
export const MAX_VISUAL_PDF_PAGES = 10;

export interface MultiPagePlan {
  /** Total real de páginas do PDF (contagem local via pdfjs, sem custo de IA). */
  totalPages: number;
  /** Números de página (1-indexado), em ordem, que serão renderizados/enviados. */
  pagesToRender: number[];
  /** true quando o documento tem mais páginas do que o limite (só as N primeiras entram no plano). */
  limited: boolean;
}

/**
 * Decide quais páginas processar a partir da contagem real do PDF.
 * Não renderiza nada, não chama IA, não tem custo — só aritmética.
 */
export function planMultiPagePdf(totalPages: number): MultiPagePlan {
  const safeTotalPages = Number.isFinite(totalPages) ? Math.max(0, Math.floor(totalPages)) : 0;
  const count = Math.min(safeTotalPages, MAX_VISUAL_PDF_PAGES);
  const pagesToRender = Array.from({ length: count }, (_, i) => i + 1);
  return {
    totalPages: safeTotalPages,
    pagesToRender,
    limited: safeTotalPages > MAX_VISUAL_PDF_PAGES,
  };
}

/**
 * Aviso exibido ANTES do processamento (painel de confirmação de créditos),
 * com a contagem real de páginas. `totalPages: null` cobre o caso em que a
 * contagem não pôde ser determinada (PDF corrompido/protegido) — mesmo
 * fallback conservador de antes desta mudança (planeja para 1 página).
 */
export function buildMultiPagePreProcessingNotice(totalPages: number | null): string {
  if (totalPages === null) {
    return 'PDF escaneado detectado. Não foi possível determinar o número de páginas — apenas a primeira será analisada por leitura visual.';
  }
  if (totalPages <= 1) {
    return 'Seu documento possui 1 página. Ela será analisada por leitura visual.';
  }
  if (totalPages <= MAX_VISUAL_PDF_PAGES) {
    return `Seu documento possui ${totalPages} páginas. Todas serão analisadas por leitura visual.`;
  }
  return `Seu documento possui ${totalPages} páginas. Nesta versão, serão analisadas as ${MAX_VISUAL_PDF_PAGES} primeiras. Se as informações necessárias estiverem nas páginas seguintes, divida o arquivo antes de continuar.`;
}

/** Texto do botão de confirmação — "Analisar N páginas — X créditos" (ou "as 10 primeiras" quando limitado). */
export function buildMultiPageButtonLabel(totalPages: number, creditsCost: number): string {
  if (totalPages > MAX_VISUAL_PDF_PAGES) {
    return `Analisar as ${MAX_VISUAL_PDF_PAGES} primeiras páginas — ${creditsCost} créditos`;
  }
  const count = Math.max(1, Math.min(totalPages, MAX_VISUAL_PDF_PAGES));
  return `Analisar ${count} ${count === 1 ? 'página' : 'páginas'} — ${creditsCost} créditos`;
}

/** Mensagem discreta exibida na revisão após o sucesso — "N páginas processadas e X créditos utilizados". */
export function buildMultiPageSuccessMessage(pagesProcessed: number, creditsCost: number): string {
  const pagesLabel = pagesProcessed === 1 ? 'página processada' : 'páginas processadas';
  const creditsLabel = creditsCost === 1 ? 'crédito utilizado' : 'créditos utilizados';
  return `Análise concluída — ${pagesProcessed} ${pagesLabel} e ${creditsCost} ${creditsLabel}.`;
}

/**
 * Texto discreto "Dados analisados nas páginas 1–N" (sequência contígua),
 * "Dados analisados nas páginas 1 e 3" (com lacuna — ex.: página em branco
 * no meio, números ORIGINAIS preservados, nunca renumerados) ou "na página N"
 * (uma única página útil).
 */
export function buildAnalyzedPagesLabel(pageNumbers: number[]): string | null {
  if (pageNumbers.length === 0) return null;
  if (pageNumbers.length === 1) return `Dados analisados na página ${pageNumbers[0]}.`;
  const sorted = [...pageNumbers].sort((a, b) => a - b);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  // Sequência contígua (o caso comum: nenhuma página em branco no meio) → "1–N".
  const isContiguous = sorted.every((n, i) => i === 0 || n === sorted[i - 1] + 1);
  if (isContiguous) return `Dados analisados nas páginas ${first}–${last}.`;
  // Lista natural em português: "1, 3 e 5" — nunca "1, 2, 3" por posição.
  const allButLast = sorted.slice(0, -1).join(', ');
  return `Dados analisados nas páginas ${allButLast} e ${last}.`;
}

// ─── Detecção de página em branco ───────────────────────────────────────────

/**
 * Heurística leve de "página em branco": amostra pixels (não percorre todos,
 * por desempenho) e verifica se a esmagadora maioria é quase-branca. Recebe
 * dados de pixel RGBA já extraídos (`ImageData.data`) — puro, sem depender de
 * `<canvas>` real, testável com arrays sintéticos.
 */
export function isImageDataLikelyBlank(
  data: Uint8ClampedArray | number[],
  options: { sampleStep?: number; whiteThreshold?: number; blankRatioThreshold?: number } = {},
): boolean {
  const { sampleStep = 37, whiteThreshold = 250, blankRatioThreshold = 0.995 } = options;
  const len = data.length;
  if (len < 4) return true;

  let sampled = 0;
  let nearWhite = 0;
  const strideBytes = 4 * Math.max(1, sampleStep);

  for (let i = 0; i + 2 < len; i += strideBytes) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    sampled++;
    if (r >= whiteThreshold && g >= whiteThreshold && b >= whiteThreshold) nearWhite++;
  }

  if (sampled === 0) return true;
  return nearWhite / sampled >= blankRatioThreshold;
}
