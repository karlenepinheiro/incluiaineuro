/**
 * _multiPageParts.ts — Leitura multipágina, correção de numeração (27/08/2026)
 *
 * PROBLEMA ENCONTRADO NA VALIDAÇÃO: `images: string[]` é uma lista plana —
 * se uma página do meio for descartada (ex.: página em branco), o índice da
 * imagem na lista (0, 1, 2...) deixa de corresponder ao número real da
 * página no documento original. A montagem de partes multimodais rotulava
 * cada imagem com `Página ${idx + 1}` — ou seja, um PDF de 3 páginas com a
 * página 2 em branco (imagens enviadas: [pág.1, pág.3]) chegava ao Gemini/
 * OpenAI rotulado como "Página 1" e "Página 2", RENUMERANDO a página 3 como
 * se fosse a segunda página do documento.
 *
 * Correção: `pageNumbers`, opcional e retrocompatível — quando presente (e
 * do mesmo tamanho de `images`), cada parte usa o número de página REAL
 * (`pageNumbers[idx]`) em vez da posição no array. Quando ausente (chamadas
 * antigas, sem essa informação), o comportamento é IDÊNTICO ao de antes:
 * rótulo por posição (`idx + 1`).
 *
 * Função pura, sem Deno/imports remotos — testável diretamente (ver
 * src/__tests__/aiGatewayMultiPageParts.test.ts). Usada por `_vertex.ts`
 * (Gemini) e `_openaiProvider.ts` (OpenAI) para montar a MESMA lista de
 * rótulos/partes a partir do mesmo par (images, pageNumbers).
 */

export interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

/**
 * Resolve os rótulos de página exibidos ao modelo: os números reais quando
 * `pageNumbers` é válido (mesmo tamanho de `images`), ou a posição
 * (1-indexada) no array como fallback — o mesmo comportamento de antes desta
 * correção, preservado byte a byte para chamadas que não enviam `pageNumbers`.
 */
export function resolvePageLabels(imagesCount: number, pageNumbers?: number[]): number[] {
  if (pageNumbers && pageNumbers.length === imagesCount) {
    return pageNumbers;
  }
  return Array.from({ length: imagesCount }, (_, i) => i + 1);
}

/** Extrai (mimeType, data-base64-sem-prefixo) de um data URL — mesmo parsing usado no Gemini/OpenAI. */
export function splitDataUrl(img: string): { mimeType: string; data: string } {
  const mimeMatch = img.match(/^data:([^;]+);base64,/);
  const mimeType = mimeMatch?.[1] || 'image/jpeg';
  const data = img.includes(',') ? img.split(',')[1] : img;
  return { mimeType, data };
}

/**
 * Monta as partes multimodais do Gemini (`contents[0].parts`) a partir de
 * uma ou mais imagens. Com 1 única imagem, o resultado é BYTE A BYTE
 * idêntico ao formato de antes da leitura multipágina (nenhum rótulo de
 * página é adicionado). Com mais de 1, cada imagem é precedida por um rótulo
 * textual "Página N" — N sendo o número real da página quando `pageNumbers`
 * é informado, ou a posição no array caso contrário.
 */
export function buildGeminiMultiImageParts(images: string[], pageNumbers?: number[]): GeminiPart[] {
  const multiPage = images.length > 1;
  const labels = resolvePageLabels(images.length, pageNumbers);
  const parts: GeminiPart[] = [];
  images.forEach((img, idx) => {
    const { mimeType, data } = splitDataUrl(img);
    if (multiPage) parts.push({ text: `Página ${labels[idx]}` });
    parts.push({ inlineData: { mimeType, data } });
  });
  return parts;
}

export interface OpenAIContentPart {
  type: string;
  text?: string;
  image_url?: string;
}

/**
 * Monta os itens de conteúdo de imagem da mensagem OpenAI (`content`, além
 * do `input_text` do prompt, adicionado pelo chamador). Mesma convenção do
 * Gemini: rótulo só aparece com mais de 1 imagem, e usa o número real da
 * página quando `pageNumbers` está disponível.
 */
export function buildOpenAIMultiImageContent(images: string[], pageNumbers?: number[]): OpenAIContentPart[] {
  const multiPage = images.length > 1;
  const labels = resolvePageLabels(images.length, pageNumbers);
  const content: OpenAIContentPart[] = [];
  images.forEach((img, idx) => {
    if (multiPage) content.push({ type: 'input_text', text: `Página ${labels[idx]}` });
    content.push({ type: 'input_image', image_url: img });
  });
  return content;
}
