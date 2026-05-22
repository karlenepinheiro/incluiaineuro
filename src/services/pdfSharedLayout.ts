// services/pdfSharedLayout.ts
// ─────────────────────────────────────────────────────────────────────────────
// IncluiAI — Base premium compartilhada para documentos PDF (A4 vertical).
//
// Este módulo NÃO altera nenhum PDF existente. Ele apenas EXPORTA helpers
// reutilizáveis para futuros documentos formais (PEI, PAEE, PDI, Estudo de
// Caso, Relatórios). Nenhum import deste módulo é feito por arquivos do
// sistema ainda — a integração será planejada na sprint DOC-2B.
//
// Regras de design:
//   • A4 vertical (210 × 297 mm).
//   • Margens consistentes, área útil bem definida.
//   • Tipografia hierárquica, fonte base 11 pt para corpo.
//   • Cores institucionais discretas; texto em quase-preto.
//   • Visual escolar, limpo, sem excesso de cor, compatível com impressão.
//   • Cabeçalho e rodapé que não invadem a área de conteúdo.
//   • Justificação simples (gap entre palavras) com fallback à esquerda.
//
// Restrições técnicas:
//   • TypeScript estrito.
//   • Sem dependência de React, DOM, window, document, fetch, canvas etc.
//   • Sem import de "jspdf" — usa interface mínima `JsPdfLike` para
//     compatibilidade ampla com jsPDF v2/v3/v4 e variantes em window.jspdf.
// ─────────────────────────────────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */

// ─── Tipagem leve para uma instância jsPDF ───────────────────────────────────
// Cobre apenas o subconjunto de métodos utilizado pelos helpers deste módulo.
// Mantida intencionalmente permissiva (retornos `any`) para casar com
// múltiplas versões do jsPDF sem exigir o pacote como dependência de tipos.

export interface JsPdfTextOptions {
  align?: 'left' | 'center' | 'right' | 'justify';
  baseline?: 'alphabetic' | 'top' | 'middle' | 'bottom';
  maxWidth?: number;
  charSpace?: number;
  lineHeightFactor?: number;
}

export interface JsPdfPageSize {
  getWidth(): number;
  getHeight(): number;
  width?: number;
  height?: number;
}

export interface JsPdfInternal {
  pageSize: JsPdfPageSize;
  getNumberOfPages?: () => number;
}

export interface JsPdfLike {
  internal: JsPdfInternal;
  setFont(family: string, style?: string): any;
  setFontSize(size: number): any;
  setTextColor(r: number, g: number, b: number): any;
  setDrawColor(r: number, g: number, b: number): any;
  setFillColor(r: number, g: number, b: number): any;
  setLineWidth(w: number): any;
  text(text: string | string[], x: number, y: number, options?: JsPdfTextOptions): any;
  line(x1: number, y1: number, x2: number, y2: number): any;
  rect(x: number, y: number, w: number, h: number, style?: string): any;
  roundedRect?(x: number, y: number, w: number, h: number, rx: number, ry: number, style?: string): any;
  splitTextToSize(text: string, maxWidth: number): string[];
  getTextWidth(text: string): number;
  addPage(format?: string | number[], orientation?: string): any;
  setPage?(pageNumber: number): any;
  addImage?(
    imageData: string,
    format: string,
    x: number,
    y: number,
    w: number,
    h: number,
    alias?: string,
    compression?: string,
    rotation?: number,
  ): any;
  getNumberOfPages?: () => number;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

/** Dimensões físicas e área útil do documento A4 vertical (milímetros). */
export const PDF_PAGE = Object.freeze({
  /** Largura A4 em mm. */
  width: 210,
  /** Altura A4 em mm. */
  height: 297,
  /** Orientação fixa. */
  orientation: 'portrait' as const,
  /** Unidade de medida usada pelos helpers (mm). */
  unit: 'mm' as const,
});

/** Margens, altura de cabeçalho/rodapé e área útil derivada. */
export const PDF_MARGINS = Object.freeze({
  top: 22,           // espaço para conteúdo abaixo do cabeçalho corrido
  right: 18,
  bottom: 20,        // espaço acima do rodapé
  left: 18,
  /** Altura reservada para o cabeçalho corrido (a partir do topo). */
  headerHeight: 16,
  /** Altura reservada para o rodapé (acima da borda inferior). */
  footerHeight: 12,
  /** Y de início seguro do conteúdo. */
  get contentTop(): number { return this.top; },
  /** Y máximo seguro antes de invadir o rodapé. */
  get contentBottom(): number { return PDF_PAGE.height - this.bottom; },
  /** X esquerdo da área útil. */
  get contentLeft(): number { return this.left; },
  /** X direito da área útil. */
  get contentRight(): number { return PDF_PAGE.width - this.right; },
  /** Largura útil de texto. */
  get contentWidth(): number { return PDF_PAGE.width - this.left - this.right; },
  /** Altura útil de texto. */
  get contentHeight(): number { return PDF_PAGE.height - this.top - this.bottom; },
});

/** Paleta institucional discreta — preto/quase preto para texto. */
export const PDF_COLORS = Object.freeze({
  text:        [28, 32, 46]   as readonly [number, number, number],
  textMuted:   [90, 95, 110]  as readonly [number, number, number],
  textSubtle:  [125, 130, 140] as readonly [number, number, number],
  heading:     [22, 26, 38]   as readonly [number, number, number],
  /** Petróleo institucional — use com parcimônia (faixas/títulos). */
  primary:     [31, 78, 95]   as readonly [number, number, number],
  /** Linha/borda neutra. */
  border:      [205, 212, 219] as readonly [number, number, number],
  /** Borda sutil para divisores discretos. */
  divider:     [225, 229, 234] as readonly [number, number, number],
  /** Fundo claro para faixas de seção. */
  surface:     [246, 247, 249] as readonly [number, number, number],
  white:       [255, 255, 255] as readonly [number, number, number],
});

/** Hierarquia tipográfica e entrelinhas. */
export const PDF_TYPOGRAPHY = Object.freeze({
  /** Família padrão. Fallback seguro: helvetica (sempre presente em jsPDF). */
  family: 'helvetica',
  size: {
    title: 16,       // título do documento (cabeçalho)
    subtitle: 11,    // subtítulo do cabeçalho
    sectionTitle: 12,
    body: 11,        // corpo padrão (entre 11 e 12, conforme requisito)
    label: 9.5,
    small: 9,
    tiny: 8,
    footer: 8,
  },
  lineHeight: {
    body: 5.0,       // mm — confortável para corpo 11 pt
    compact: 4.4,    // listas e blocos densos
    title: 6.2,
  },
});

// ─── Tipos exportados ────────────────────────────────────────────────────────

export interface PdfDocumentHeaderOptions {
  title: string;
  subtitle?: string;
  schoolName?: string;
  studentName?: string;
  grade?: string;
  documentCode?: string;
  documentType?: string;
  generatedAt?: string | Date;
  /** Data URL (PNG/JPEG) do logo institucional, opcional. */
  logoDataUrl?: string;
  /** Sobrescreve a família de fonte do cabeçalho. */
  fontFamily?: string;
}

export interface PdfDocumentFooterOptions {
  pageNumber: number;
  totalPages?: number;
  auditCode?: string;
  generatedAt?: string | Date;
  generatedBy?: string;
  /** Nome do sistema exibido à esquerda do rodapé. */
  systemName?: string;
  fontFamily?: string;
  /**
   * Texto curto centralizado na linha 1 do rodapé.
   * Útil para selos institucionais como "DOCUMENTO VALIDADO" / "DOCUMENTO REGISTRADO".
   */
  centerLabel?: string;
  /** Cor do `centerLabel`. Padrão: PDF_COLORS.primary (petróleo). */
  centerLabelColor?: readonly [number, number, number];
}

export interface PdfStudentIdentificationData {
  studentName?: string;
  birthDate?: string;
  age?: string;
  grade?: string;
  schoolName?: string;
  guardianName?: string;
  diagnosis?: string;
  cid?: string;
  shift?: string;
  city?: string;
}

export interface PdfSectionTitleOptions {
  fontFamily?: string;
  /** Tamanho de fonte do título (pt). Padrão: PDF_TYPOGRAPHY.size.sectionTitle. */
  fontSize?: number;
  /** Desenhar faixa de fundo sutil atrás do título. Padrão: true. */
  withBackground?: boolean;
  /** Cor do texto do título. Padrão: PDF_COLORS.heading. */
  color?: readonly [number, number, number];
  /** Espaçamento extra abaixo do título (mm). Padrão: 2. */
  marginBottom?: number;
}

export interface PdfParagraphOptions {
  fontFamily?: string;
  fontSize?: number;
  lineHeight?: number;
  /** 'left' (padrão) ou 'justify'. Centro/direita não são suportados aqui. */
  align?: 'left' | 'justify';
  color?: readonly [number, number, number];
  /** Estilo da fonte: 'normal' (padrão), 'bold', 'italic', 'bolditalic'. */
  fontStyle?: 'normal' | 'bold' | 'italic' | 'bolditalic';
}

export interface PdfSignature {
  name: string;
  role?: string;
}

export interface PdfSignatureBlockOptions {
  fontFamily?: string;
  /** Espaço acima do bloco (mm). Padrão: 14. */
  marginTop?: number;
  /** Largura mínima da linha de cada assinatura (mm). Padrão: 55. */
  lineWidth?: number;
  /** Contexto para reaplicar header/footer se houver page break. */
  context?: PdfLayoutContext;
}

/**
 * Contexto compartilhado entre helpers — permite que `ensureSpace` saiba
 * como redesenhar cabeçalho/rodapé ao quebrar página.
 */
export interface PdfLayoutContext {
  header?: PdfDocumentHeaderOptions;
  footer?: Omit<PdfDocumentFooterOptions, 'pageNumber'>;
  /** Caso fornecido, sobrescreve o cálculo automático de pageNumber. */
  pageNumber?: number;
}

// ─── Utilitários internos ────────────────────────────────────────────────────

const setRGBText = (
  doc: JsPdfLike,
  c: readonly [number, number, number],
): void => { doc.setTextColor(c[0], c[1], c[2]); };

const setRGBDraw = (
  doc: JsPdfLike,
  c: readonly [number, number, number],
): void => { doc.setDrawColor(c[0], c[1], c[2]); };

const setRGBFill = (
  doc: JsPdfLike,
  c: readonly [number, number, number],
): void => { doc.setFillColor(c[0], c[1], c[2]); };

const pageWidth  = (doc: JsPdfLike): number =>
  doc.internal.pageSize.getWidth?.() ?? doc.internal.pageSize.width ?? PDF_PAGE.width;

const pageHeight = (doc: JsPdfLike): number =>
  doc.internal.pageSize.getHeight?.() ?? doc.internal.pageSize.height ?? PDF_PAGE.height;

const safeFontFamily = (
  family: string | undefined,
): string => (family && family.trim()) || PDF_TYPOGRAPHY.family;

const safeText = (s: string | undefined | null): string =>
  (s == null ? '' : String(s)).replace(/\s+/g, ' ').trim();

// ─── Datas ───────────────────────────────────────────────────────────────────

/** Converte ISO/Date/`DD/MM/YYYY` para `DD/MM/YYYY`. Retorna `''` se inválido. */
export function formatDateBR(date?: string | Date | null): string {
  if (date == null || date === '') return '';
  if (date instanceof Date) {
    if (Number.isNaN(date.getTime())) return '';
    const d = String(date.getDate()).padStart(2, '0');
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const y = String(date.getFullYear());
    return `${d}/${m}/${y}`;
  }
  const s = String(date).trim();
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  // Última tentativa: deixar o Date interpretar.
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) return formatDateBR(parsed);
  return s;
}

/** Formato curto pt-BR para data + hora, ex.: `20/05/2026 14:32`. */
export function formatDateTimeBR(date?: string | Date | null): string {
  if (date == null || date === '') return '';
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return formatDateBR(date);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear());
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yy} ${hh}:${mi}`;
}

// ─── Cabeçalho ───────────────────────────────────────────────────────────────

/**
 * Desenha o cabeçalho institucional do documento.
 * Retorna o próximo `y` seguro para iniciar conteúdo abaixo do cabeçalho.
 *
 * Layout:
 *   ┌────────────────────────────────────────────────────────────────┐
 *   │ [Logo] ESCOLA / SISTEMA           CÓDIGO • TIPO • DATA          │
 *   │        TÍTULO DO DOCUMENTO                                       │
 *   │        Subtítulo • Aluno • Série                                 │
 *   │ ──────────────────────────────────────────────────────────────── │
 *   └────────────────────────────────────────────────────────────────┘
 */
export function addDocumentHeader(
  doc: JsPdfLike,
  options: PdfDocumentHeaderOptions,
): number {
  const W = pageWidth(doc);
  const family = safeFontFamily(options.fontFamily);

  const title       = safeText(options.title) || 'Documento';
  const subtitle    = safeText(options.subtitle);
  const schoolName  = safeText(options.schoolName);
  const studentName = safeText(options.studentName);
  const grade       = safeText(options.grade);
  const docCode     = safeText(options.documentCode);
  const docType     = safeText(options.documentType);
  const generated   = options.generatedAt ? formatDateBR(options.generatedAt) : '';

  const leftX  = PDF_MARGINS.left;
  const rightX = W - PDF_MARGINS.right;

  // Faixa de logo opcional à esquerda.
  let textX = leftX;
  const LOGO_SIZE = 9; // mm
  if (options.logoDataUrl && typeof doc.addImage === 'function') {
    try {
      const fmt = options.logoDataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
      doc.addImage(options.logoDataUrl, fmt, leftX, 6, LOGO_SIZE, LOGO_SIZE);
      textX = leftX + LOGO_SIZE + 3;
    } catch {
      // Sem logo se falhar — não interrompe a geração.
    }
  }

  // Linha 1 — escola (à esquerda, pequena) + meta à direita.
  doc.setFont(family, 'bold');
  doc.setFontSize(PDF_TYPOGRAPHY.size.small);
  setRGBText(doc, PDF_COLORS.textMuted);
  if (schoolName) {
    const maxSchoolW = rightX - textX - 70; // reserva espaço para a meta da direita
    const schoolLines = doc.splitTextToSize(schoolName.toUpperCase(), Math.max(40, maxSchoolW));
    doc.text(schoolLines[0] ?? '', textX, 9);
  }

  // Meta à direita (código • tipo • data).
  const metaParts: string[] = [];
  if (docCode) metaParts.push(docCode);
  if (docType) metaParts.push(docType);
  if (generated) metaParts.push(generated);
  if (metaParts.length) {
    doc.setFont(family, 'normal');
    doc.setFontSize(PDF_TYPOGRAPHY.size.tiny);
    setRGBText(doc, PDF_COLORS.textSubtle);
    doc.text(metaParts.join('  •  '), rightX, 9, { align: 'right' });
  }

  // Linha 2 — título do documento.
  doc.setFont(family, 'bold');
  doc.setFontSize(PDF_TYPOGRAPHY.size.title);
  setRGBText(doc, PDF_COLORS.heading);
  doc.text(title, textX, 15.5);

  // Linha 3 — subtítulo opcional / aluno • série.
  const subParts: string[] = [];
  if (subtitle) subParts.push(subtitle);
  if (studentName) subParts.push(studentName);
  if (grade) subParts.push(grade);
  if (subParts.length) {
    doc.setFont(family, 'normal');
    doc.setFontSize(PDF_TYPOGRAPHY.size.subtitle);
    setRGBText(doc, PDF_COLORS.textMuted);
    doc.text(subParts.join(' • '), textX, 20.5);
  }

  // Linha divisória inferior do cabeçalho.
  setRGBDraw(doc, PDF_COLORS.divider);
  doc.setLineWidth(0.3);
  const dividerY = Math.max(PDF_MARGINS.headerHeight + 5, 22);
  doc.line(leftX, dividerY, rightX, dividerY);

  // y de retorno: garante respiro acima do conteúdo.
  return Math.max(PDF_MARGINS.contentTop, dividerY + 4);
}

// ─── Rodapé ──────────────────────────────────────────────────────────────────

/**
 * Desenha o rodapé do documento na página corrente.
 *
 * Layout:
 *   ──────────────────────────────────────────────────────────────────
 *   IncluiAI • Gerado em DD/MM/YYYY • por Usuário        Página X de Y
 *   Código: AUDIT-CODE
 */
export function addDocumentFooter(
  doc: JsPdfLike,
  options: PdfDocumentFooterOptions,
): void {
  const W = pageWidth(doc);
  const H = pageHeight(doc);
  const family = safeFontFamily(options.fontFamily);
  const systemName = safeText(options.systemName) || 'IncluiAI';

  const leftX  = PDF_MARGINS.left;
  const rightX = W - PDF_MARGINS.right;
  const baseY  = H - PDF_MARGINS.bottom + 6;

  // Divisória superior do rodapé.
  setRGBDraw(doc, PDF_COLORS.divider);
  doc.setLineWidth(0.3);
  doc.line(leftX, H - PDF_MARGINS.bottom, rightX, H - PDF_MARGINS.bottom);

  doc.setFont(family, 'normal');
  doc.setFontSize(PDF_TYPOGRAPHY.size.footer);
  setRGBText(doc, PDF_COLORS.textSubtle);

  const leftParts: string[] = [systemName];
  if (options.generatedAt) {
    leftParts.push(`Gerado em ${formatDateBR(options.generatedAt)}`);
  }
  if (options.generatedBy && safeText(options.generatedBy)) {
    leftParts.push(`por ${safeText(options.generatedBy)}`);
  }
  doc.text(leftParts.join(' • '), leftX, baseY);

  // Página X / X de Y à direita.
  const pageLabel = options.totalPages
    ? `Página ${options.pageNumber} de ${options.totalPages}`
    : `Página ${options.pageNumber}`;
  doc.text(pageLabel, rightX, baseY, { align: 'right' });

  // Selo institucional centralizado (opcional).
  if (options.centerLabel && safeText(options.centerLabel)) {
    doc.setFont(family, 'bold');
    doc.setFontSize(PDF_TYPOGRAPHY.size.footer);
    setRGBText(doc, options.centerLabelColor ?? PDF_COLORS.primary);
    doc.text(safeText(options.centerLabel), W / 2, baseY, { align: 'center' });
    // Restaura estilo padrão para a linha 2.
    doc.setFont(family, 'normal');
    setRGBText(doc, PDF_COLORS.textSubtle);
  }

  // Linha secundária — código de auditoria, se houver.
  if (options.auditCode && safeText(options.auditCode)) {
    doc.setFont('courier', 'normal');
    doc.setFontSize(PDF_TYPOGRAPHY.size.tiny);
    setRGBText(doc, PDF_COLORS.textSubtle);
    doc.text(`Código: ${safeText(options.auditCode)}`, leftX, baseY + 4);
    doc.setFont(family, 'normal');
  }
}

// ─── Bloco de identificação do aluno ─────────────────────────────────────────

/**
 * Desenha um bloco padronizado de identificação do aluno. Apenas exibe os
 * campos efetivamente preenchidos — nunca inventa diagnóstico, CID etc.
 * Retorna o próximo `y` após o bloco.
 */
export function addStudentIdentificationBlock(
  doc: JsPdfLike,
  data: PdfStudentIdentificationData,
  y: number,
  fontFamily?: string,
): number {
  const family = safeFontFamily(fontFamily);
  const leftX  = PDF_MARGINS.contentLeft;
  const rightX = PDF_MARGINS.contentRight;
  const width  = rightX - leftX;

  const rows: Array<[string, string]> = [];
  const push = (label: string, value?: string): void => {
    const v = safeText(value);
    if (v) rows.push([label, v]);
  };
  push('Aluno(a)',       data.studentName);
  push('Nascimento',     data.birthDate ? formatDateBR(data.birthDate) : undefined);
  push('Idade',          data.age);
  push('Série/Turma',    data.grade);
  push('Turno',          data.shift);
  push('Escola',         data.schoolName);
  push('Município',      data.city);
  push('Responsável',    data.guardianName);
  push('Diagnóstico',    data.diagnosis);
  push('CID',            data.cid);

  if (!rows.length) return y;

  // Título do bloco
  const headerY = y;
  setRGBFill(doc, PDF_COLORS.surface);
  doc.rect(leftX, headerY, width, 7, 'F');
  doc.setFont(family, 'bold');
  doc.setFontSize(PDF_TYPOGRAPHY.size.label);
  setRGBText(doc, PDF_COLORS.heading);
  doc.text('IDENTIFICAÇÃO', leftX + 2.5, headerY + 5);

  let cursor = headerY + 7 + 1.5;

  // Layout em 2 colunas
  const colGap = 6;
  const colW   = (width - colGap) / 2;
  const rowH   = 6.0;

  doc.setFontSize(PDF_TYPOGRAPHY.size.body);

  const drawRow = (label: string, value: string, x: number, yRow: number): void => {
    doc.setFont(family, 'bold');
    setRGBText(doc, PDF_COLORS.textMuted);
    const lbl = `${label}: `;
    doc.text(lbl, x, yRow);
    const lblW = doc.getTextWidth(lbl);

    doc.setFont(family, 'normal');
    setRGBText(doc, PDF_COLORS.text);
    const valueLines = doc.splitTextToSize(value, colW - lblW);
    doc.text(valueLines[0] ?? '', x + lblW, yRow);
  };

  for (let i = 0; i < rows.length; i += 2) {
    const left  = rows[i];
    const right = rows[i + 1];
    drawRow(left[0], left[1], leftX, cursor);
    if (right) drawRow(right[0], right[1], leftX + colW + colGap, cursor);
    cursor += rowH;
  }

  // Linha divisória discreta no fim do bloco
  cursor += 1;
  setRGBDraw(doc, PDF_COLORS.divider);
  doc.setLineWidth(0.2);
  doc.line(leftX, cursor, rightX, cursor);

  return cursor + 4;
}

// ─── Título de seção ─────────────────────────────────────────────────────────

/**
 * Desenha um título de seção com hierarquia visual moderada.
 * Retorna o próximo `y` após o título.
 */
export function addSectionTitle(
  doc: JsPdfLike,
  title: string,
  y: number,
  options: PdfSectionTitleOptions = {},
): number {
  const family   = safeFontFamily(options.fontFamily);
  const fontSize = options.fontSize ?? PDF_TYPOGRAPHY.size.sectionTitle;
  const color    = options.color ?? PDF_COLORS.heading;
  const withBg   = options.withBackground ?? true;
  const marginBottom = options.marginBottom ?? 2;

  const leftX  = PDF_MARGINS.contentLeft;
  const rightX = PDF_MARGINS.contentRight;
  const width  = rightX - leftX;

  const blockH = 7.5;

  if (withBg) {
    setRGBFill(doc, PDF_COLORS.surface);
    doc.rect(leftX, y, width, blockH, 'F');
    // Barra fina à esquerda como indicador da seção.
    setRGBFill(doc, PDF_COLORS.primary);
    doc.rect(leftX, y, 1.6, blockH, 'F');
  }

  doc.setFont(family, 'bold');
  doc.setFontSize(fontSize);
  setRGBText(doc, color);
  const textX = leftX + (withBg ? 4 : 0);
  const textY = y + blockH - 2.4;
  const titleSafe = safeText(title) || 'Seção';
  doc.text(titleSafe.toUpperCase(), textX, textY);

  return y + blockH + marginBottom;
}

// ─── Parágrafo (com fallback de justificação) ────────────────────────────────

/**
 * Desenha texto multilinha, com fallback seguro para texto justificado.
 * • `align: 'left'` (padrão) — alinhamento à esquerda.
 * • `align: 'justify'` — distribui espaço entre palavras para todas as
 *   linhas exceto a última. Linhas com 1 palavra ficam alinhadas à esquerda.
 *
 * Não usa setCharSpace (variável entre versões do jsPDF) — opera com posições
 * explícitas de palavras, garantindo preservação de acentos e sem cortar.
 *
 * Retorna o `y` final (após a última linha).
 */
export function addParagraph(
  doc: JsPdfLike,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  options: PdfParagraphOptions = {},
): number {
  const family   = safeFontFamily(options.fontFamily);
  const fontSize = options.fontSize ?? PDF_TYPOGRAPHY.size.body;
  const lineH    = options.lineHeight ?? PDF_TYPOGRAPHY.lineHeight.body;
  const align    = options.align ?? 'left';
  const color    = options.color ?? PDF_COLORS.text;
  const style    = options.fontStyle ?? 'normal';

  const content = (text == null ? '' : String(text));
  if (!content.trim()) return y;

  doc.setFont(family, style);
  doc.setFontSize(fontSize);
  setRGBText(doc, color);

  const lines = doc.splitTextToSize(content, maxWidth);
  if (!lines.length) return y;

  // y aqui é a baseline da primeira linha.
  let cursorY = y;

  if (align === 'left') {
    doc.text(lines, x, cursorY);
    return cursorY + lineH * (lines.length - 1) + lineH;
  }

  // align === 'justify'
  const lastIndex = lines.length - 1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isLast = i === lastIndex;
    const words = line.split(/\s+/).filter(Boolean);

    if (isLast || words.length <= 1) {
      doc.text(line, x, cursorY);
    } else {
      // Calcula largura total das palavras e distribui o restante nos gaps.
      let wordsW = 0;
      const widths: number[] = new Array(words.length);
      for (let w = 0; w < words.length; w++) {
        widths[w] = doc.getTextWidth(words[w]);
        wordsW += widths[w];
      }
      const totalGapSpace = Math.max(0, maxWidth - wordsW);
      const gap = totalGapSpace / (words.length - 1);

      // Limite de segurança: se o gap ficaria absurdamente grande
      // (linha muito curta), preferimos não justificar.
      const spaceW = doc.getTextWidth(' ');
      if (gap > spaceW * 4) {
        doc.text(line, x, cursorY);
      } else {
        let wx = x;
        for (let w = 0; w < words.length; w++) {
          doc.text(words[w], wx, cursorY);
          wx += widths[w] + gap;
        }
      }
    }
    cursorY += lineH;
  }

  return cursorY;
}

// ─── Quebra de página segura ─────────────────────────────────────────────────

/**
 * Garante que existe ao menos `requiredHeight` mm disponíveis antes do rodapé.
 * Caso contrário, adiciona nova página e reaplica cabeçalho/rodapé conforme
 * `context`. Retorna o novo `y` (no topo do conteúdo da nova página, ou o
 * mesmo `y` recebido se não foi necessário quebrar).
 */
export function ensureSpace(
  doc: JsPdfLike,
  y: number,
  requiredHeight: number,
  context?: PdfLayoutContext,
): number {
  const limit = pageHeight(doc) - PDF_MARGINS.bottom - PDF_MARGINS.footerHeight;
  if (y + requiredHeight <= limit) return y;

  doc.addPage();

  // Reaplica cabeçalho (se contexto fornecido).
  let nextY = PDF_MARGINS.contentTop;
  if (context?.header) {
    nextY = addDocumentHeader(doc, context.header);
  }

  // Reaplica rodapé com número de página atualizado.
  if (context?.footer || context?.pageNumber != null) {
    const pageNumber =
      context?.pageNumber
      ?? doc.internal.getNumberOfPages?.()
      ?? doc.getNumberOfPages?.()
      ?? 1;
    addDocumentFooter(doc, {
      ...(context?.footer ?? {}),
      pageNumber,
    });
  }

  return nextY;
}

// ─── Bloco de assinaturas ────────────────────────────────────────────────────

/**
 * Desenha um bloco de 1 a 4 assinaturas. Usa apenas nome + cargo (não exige
 * matrícula nem registro). Evita quebrar o bloco entre páginas chamando
 * `ensureSpace` antes de desenhar.
 *
 * Layout:
 *   • 1 assinatura      → centralizada (largura da linha).
 *   • 2 assinaturas     → duas colunas, lado a lado.
 *   • 3 ou 4 assinaturas → grade 2 colunas × N linhas.
 *
 * Retorna o `y` após o bloco.
 */
export function addSignatureBlock(
  doc: JsPdfLike,
  signatures: ReadonlyArray<PdfSignature>,
  y: number,
  options: PdfSignatureBlockOptions = {},
): number {
  const list = (signatures ?? [])
    .filter((s): s is PdfSignature => !!s && !!safeText(s.name))
    .slice(0, 4);
  if (!list.length) return y;

  const family = safeFontFamily(options.fontFamily);
  const marginTop = options.marginTop ?? 14;
  const lineW = options.lineWidth ?? 55;

  // Altura aproximada do bloco para `ensureSpace`.
  const rows = list.length <= 2 ? 1 : 2;
  const cellH = 18;
  const requiredH = marginTop + rows * cellH + 6;

  const yAfterSpace = ensureSpace(doc, y, requiredH, options.context);
  const startY = (yAfterSpace === y ? y : yAfterSpace) + marginTop;

  const contentLeft  = PDF_MARGINS.contentLeft;
  const contentRight = PDF_MARGINS.contentRight;
  const contentW     = contentRight - contentLeft;

  const drawOne = (sig: PdfSignature, centerX: number, baseY: number): void => {
    // Linha de assinatura
    setRGBDraw(doc, PDF_COLORS.text);
    doc.setLineWidth(0.4);
    doc.line(centerX - lineW / 2, baseY, centerX + lineW / 2, baseY);

    // Nome
    doc.setFont(family, 'bold');
    doc.setFontSize(PDF_TYPOGRAPHY.size.body);
    setRGBText(doc, PDF_COLORS.text);
    doc.text(safeText(sig.name), centerX, baseY + 4.5, { align: 'center' });

    // Cargo (opcional)
    const role = safeText(sig.role);
    if (role) {
      doc.setFont(family, 'normal');
      doc.setFontSize(PDF_TYPOGRAPHY.size.small);
      setRGBText(doc, PDF_COLORS.textMuted);
      doc.text(role, centerX, baseY + 9, { align: 'center' });
    }
  };

  let cursorY = startY;

  if (list.length === 1) {
    drawOne(list[0], contentLeft + contentW / 2, cursorY);
    cursorY += cellH;
  } else if (list.length === 2) {
    drawOne(list[0], contentLeft + contentW * 0.25, cursorY);
    drawOne(list[1], contentLeft + contentW * 0.75, cursorY);
    cursorY += cellH;
  } else {
    // 3 ou 4 → grade 2×2
    drawOne(list[0], contentLeft + contentW * 0.25, cursorY);
    drawOne(list[1], contentLeft + contentW * 0.75, cursorY);
    drawOne(list[2], contentLeft + contentW * 0.25, cursorY);
    if (list[3]) {
      drawOne(list[3], contentLeft + contentW * 0.75, cursorY);
    }
    cursorY += cellH;
  }

  return cursorY + 2;
}

// ─── Export padrão (objeto opcional, conveniência) ───────────────────────────

/**
 * Conveniência: exporta os helpers como um único objeto para quem prefere
 * import nominal único. Uso recomendado continua sendo os imports nominais.
 */
export const pdfSharedLayout = Object.freeze({
  PDF_PAGE,
  PDF_MARGINS,
  PDF_COLORS,
  PDF_TYPOGRAPHY,
  addDocumentHeader,
  addDocumentFooter,
  addStudentIdentificationBlock,
  addSectionTitle,
  addParagraph,
  ensureSpace,
  addSignatureBlock,
  formatDateBR,
  formatDateTimeBR,
});

export default pdfSharedLayout;
