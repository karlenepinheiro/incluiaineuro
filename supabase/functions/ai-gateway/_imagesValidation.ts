/**
 * _imagesValidation.ts — Leitura multipágina (PDF escaneado), 27/08/2026
 * Limites corrigidos em 27/08/2026 (achado da validação de payload — ver
 * relatório).
 *
 * Valida o campo opcional `images` do payload do Gateway — a extensão
 * mínima e retrocompatível que permite enviar VÁRIAS páginas (data URLs)
 * numa única chamada multimodal, em vez de um único `imageBase64`. Chamadas
 * existentes que só enviam `imageBase64` continuam 100% inalteradas: este
 * campo é só usado quando presente.
 *
 * Regras (limite inicial oficial desta fase — ver relatório da sprint):
 *   - no máximo MAX_GATEWAY_IMAGES páginas por análise;
 *   - cada página deve ser um data URL "data:image/{jpeg|png|webp};base64,..."
 *     bem formado (mesmos 3 formatos já aceitos por `imageBase64`);
 *   - tamanho por página e tamanho total limitados, para rejeitar payloads
 *     abusivos ANTES de reservar crédito ou chamar o provider.
 *
 * SOBRE OS NÚMEROS (corrigido em 27/08/2026 — o comentário anterior estava
 * invertido): `MAX_IMAGE_BASE64_CHARS`/`MAX_TOTAL_IMAGES_BASE64_CHARS` contam
 * CARACTERES DA STRING BASE64 (`match[2].length` abaixo) — ou seja, o
 * tamanho TRANSMITIDO (texto), não o tamanho decodificado do arquivo
 * original (que é ~25% menor: base64 expande em ~4/3). A fonte de verdade
 * para o limite é a documentação oficial do Gemini API
 * (https://ai.google.dev/gemini-api/docs/image-understanding, verificada em
 * 27/08/2026): "Inline image data limits your total request size (text
 * prompts, system instructions, and inline bytes) to 20MB" — 20 MB é o
 * TOTAL da requisição (prompt + todas as imagens), não por imagem. O limite
 * do corpo de requisição do Supabase Edge Functions NÃO está documentado
 * publicamente (supabase.com/docs/guides/functions/limits não especifica um
 * valor) — os limites abaixo foram calibrados só contra o teto conhecido do
 * Gemini, com margem de segurança; o teto real do Supabase é uma incerteza
 * não verificada nesta validação (nenhuma requisição real foi feita para
 * descobri-lo).
 */

/** No máximo 10 páginas por análise (regra de páginas da leitura multipágina). */
export const MAX_GATEWAY_IMAGES = 10;
/** ~2,7 MB de texto base64 por página (~2 MB decodificados) — teto individual, defesa contra uma única imagem patológica. */
export const MAX_IMAGE_BASE64_CHARS = 2_700_000;
/**
 * ~15 MB de texto base64 no total, somando todas as páginas de uma análise
 * — mantém margem de ~5 MB sob o teto de 20 MB do Gemini (prompt + envelope
 * JSON + rótulos "Página N" são desprezíveis perto disso, mas a margem
 * também cobre a incerteza sobre o limite real do corpo do Supabase Edge
 * Functions, que não é documentado).
 */
export const MAX_TOTAL_IMAGES_BASE64_CHARS = 15_000_000;

const DATA_URL_RE = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+=*)$/;

export type ImagesValidationReason =
  | 'NOT_ARRAY'
  | 'EMPTY'
  | 'TOO_MANY'
  | 'INVALID_FORMAT'
  | 'IMAGE_TOO_LARGE'
  | 'TOTAL_TOO_LARGE';

export interface ImagesValidationResult {
  ok: boolean;
  /** Presente e igual à entrada quando `ok`. */
  images?: string[];
  reason?: ImagesValidationReason;
  /** Índice (0-based) da página inválida, quando aplicável. */
  index?: number;
}

/**
 * `images` ausente/null é um resultado VÁLIDO (`ok: true`, `images: undefined`)
 * — o comportamento de chamadas que só usam `imageBase64` (ou nenhuma imagem)
 * não muda em nada.
 */
export function validateGatewayImages(images: unknown): ImagesValidationResult {
  if (images === undefined || images === null) return { ok: true, images: undefined };
  if (!Array.isArray(images)) return { ok: false, reason: 'NOT_ARRAY' };
  if (images.length === 0) return { ok: false, reason: 'EMPTY' };
  if (images.length > MAX_GATEWAY_IMAGES) return { ok: false, reason: 'TOO_MANY' };

  let totalChars = 0;
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    if (typeof img !== 'string') return { ok: false, reason: 'INVALID_FORMAT', index: i };
    const match = img.match(DATA_URL_RE);
    if (!match) return { ok: false, reason: 'INVALID_FORMAT', index: i };
    const b64Len = match[2].length;
    if (b64Len > MAX_IMAGE_BASE64_CHARS) return { ok: false, reason: 'IMAGE_TOO_LARGE', index: i };
    totalChars += b64Len;
  }
  if (totalChars > MAX_TOTAL_IMAGES_BASE64_CHARS) return { ok: false, reason: 'TOTAL_TOO_LARGE' };

  return { ok: true, images: images as string[] };
}

// ─── pageNumbers (correção de numeração, 27/08/2026) ──────────────────────

export type PageNumbersValidationReason =
  | 'NOT_ARRAY'
  | 'LENGTH_MISMATCH'
  | 'INVALID_VALUE'
  | 'NOT_ASCENDING';

export interface PageNumbersValidationResult {
  ok: boolean;
  pageNumbers?: number[];
  reason?: PageNumbersValidationReason;
}

/**
 * Valida o campo opcional `pageNumbers` — números de página REAIS
 * (1-indexado) do documento original, paralelo a `images`. Achado da
 * validação de numeração: sem isso, uma imagem descartada no meio do
 * documento (ex.: página em branco) faz o rótulo enviado ao modelo
 * renumerar as páginas restantes por posição em vez do número real — ver
 * _multiPageParts.ts.
 *
 * `pageNumbers` ausente/null é válido (`ok: true`, `pageNumbers: undefined`)
 * — chamadas que não enviam esse campo (incluindo toda chamada anterior a
 * esta correção) continuam funcionando exatamente como antes, com os
 * adapters rotulando por posição.
 */
export function validateGatewayPageNumbers(
  pageNumbers: unknown,
  imagesLength: number,
): PageNumbersValidationResult {
  if (pageNumbers === undefined || pageNumbers === null) return { ok: true, pageNumbers: undefined };
  if (!Array.isArray(pageNumbers)) return { ok: false, reason: 'NOT_ARRAY' };
  if (pageNumbers.length !== imagesLength) return { ok: false, reason: 'LENGTH_MISMATCH' };

  for (const n of pageNumbers) {
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 1) {
      return { ok: false, reason: 'INVALID_VALUE' };
    }
  }
  for (let i = 1; i < pageNumbers.length; i++) {
    if (pageNumbers[i] <= pageNumbers[i - 1]) return { ok: false, reason: 'NOT_ASCENDING' };
  }

  return { ok: true, pageNumbers: pageNumbers as number[] };
}

export function friendlyPageNumbersValidationError(reason: PageNumbersValidationReason): string {
  switch (reason) {
    case 'NOT_ARRAY':
      return 'Campo "pageNumbers" invalido: deve ser uma lista de numeros de pagina.';
    case 'LENGTH_MISMATCH':
      return 'Campo "pageNumbers" invalido: deve ter o mesmo tamanho de "images".';
    case 'INVALID_VALUE':
      return 'Campo "pageNumbers" invalido: cada numero de pagina deve ser um inteiro positivo.';
    case 'NOT_ASCENDING':
      return 'Campo "pageNumbers" invalido: os numeros de pagina devem estar em ordem crescente.';
    default:
      return 'Campo "pageNumbers" invalido.';
  }
}

/** Mensagem amigável (sem acentos, seguindo a convenção dos demais erros 400 do Gateway). */
export function friendlyImagesValidationError(reason: ImagesValidationReason): string {
  switch (reason) {
    case 'NOT_ARRAY':
      return 'Campo "images" invalido: deve ser uma lista de paginas.';
    case 'EMPTY':
      return 'Nenhuma pagina foi enviada para analise.';
    case 'TOO_MANY':
      return `No maximo ${MAX_GATEWAY_IMAGES} paginas por analise.`;
    case 'INVALID_FORMAT':
      return 'Uma das paginas enviadas tem formato invalido (use JPEG, PNG ou WEBP).';
    case 'IMAGE_TOO_LARGE':
      return 'Uma das paginas enviadas excede o tamanho maximo permitido.';
    case 'TOTAL_TOO_LARGE':
      return 'O tamanho total das paginas enviadas excede o limite permitido.';
    default:
      return 'Payload de paginas invalido.';
  }
}
