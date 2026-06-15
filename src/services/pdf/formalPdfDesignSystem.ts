/* eslint-disable @typescript-eslint/no-explicit-any */

// Foundation for future formal PDF renderers.
// This module is intentionally isolated: no current PDF flow imports it yet.

export type FormalPdfRgb = readonly [number, number, number];

export interface FormalPdfTextOptions {
  align?: 'left' | 'center' | 'right' | 'justify';
  baseline?: 'alphabetic' | 'top' | 'middle' | 'bottom';
  lineHeightFactor?: number;
  maxWidth?: number;
}

export interface FormalPdfPageSize {
  getWidth?: () => number;
  getHeight?: () => number;
  width?: number;
  height?: number;
}

export interface FormalPdfInternal {
  pageSize: FormalPdfPageSize;
  getNumberOfPages?: () => number;
  getCurrentPageInfo?: () => { pageNumber: number };
}

export interface FormalPdfDocLike {
  internal: FormalPdfInternal;
  setFont(family: string, style?: string): any;
  setFontSize(size: number): any;
  setTextColor(r: number, g: number, b: number): any;
  setDrawColor(r: number, g: number, b: number): any;
  setFillColor(r: number, g: number, b: number): any;
  setLineWidth(width: number): any;
  text(text: string | string[], x: number, y: number, options?: FormalPdfTextOptions): any;
  line(x1: number, y1: number, x2: number, y2: number): any;
  rect(x: number, y: number, width: number, height: number, style?: string): any;
  roundedRect?(x: number, y: number, width: number, height: number, rx: number, ry: number, style?: string): any;
  splitTextToSize(text: string, maxWidth: number): string[];
  getTextWidth(text: string): number;
  addPage(format?: string | number[], orientation?: string): any;
  setPage?(pageNumber: number): any;
  addImage?(
    imageData: string,
    format: string,
    x: number,
    y: number,
    width: number,
    height: number,
    alias?: string,
    compression?: string,
    rotation?: number,
  ): any;
}

export const FORMAL_PDF_PAGE = Object.freeze({
  width: 210,
  height: 297,
  unit: 'mm' as const,
  orientation: 'portrait' as const,
});

export const FORMAL_PDF_LAYOUT = Object.freeze({
  marginTop: 24,
  marginRight: 20,
  marginBottom: 22,
  marginLeft: 20,
  headerHeight: 18,
  footerHeight: 16,
  contentTop: 30,
  contentBottom: 272,
  radiusSmall: 1.5,
  radiusMedium: 2.5,
  ruleWidth: 0.25,
  contentWidth: 170,
  pageWidth: FORMAL_PDF_PAGE.width,
  pageHeight: FORMAL_PDF_PAGE.height,
});

export const FORMAL_PDF_SPACING = Object.freeze({
  xs: 2,
  sm: 4,
  md: 6,
  lg: 9,
  xl: 12,
  sectionGap: 8,
  fieldGap: 5,
  paragraphGap: 4,
  signatureGap: 10,
});

export const FORMAL_PDF_COLORS = Object.freeze({
  text: [24, 28, 37] as FormalPdfRgb,
  mutedText: [83, 88, 99] as FormalPdfRgb,
  subtleText: [125, 131, 143] as FormalPdfRgb,
  primary: [31, 78, 95] as FormalPdfRgb,
  primarySoft: [235, 244, 247] as FormalPdfRgb,
  accent: [198, 146, 20] as FormalPdfRgb,
  accentSoft: [255, 248, 229] as FormalPdfRgb,
  border: [205, 212, 220] as FormalPdfRgb,
  divider: [226, 230, 235] as FormalPdfRgb,
  sectionFill: [246, 247, 249] as FormalPdfRgb,
  white: [255, 255, 255] as FormalPdfRgb,
});

export const FORMAL_PDF_TYPOGRAPHY = Object.freeze({
  fontFamily: 'times',
  fallbackFontFamily: 'helvetica',
  mainTitleSize: 14,
  subtitleSize: 10,
  sectionTitleSize: 12,
  fieldLabelSize: 9.8,
  bodySize: 11,
  smallBodySize: 9.2,
  footerSize: 7.6,
  validationSize: 8.4,
  mainTitleLineHeight: 6.4,
  bodyLineHeight: 5.8,
  smallLineHeight: 4.7,
  footerLineHeight: 3.8,
});

export const FORMAL_LEGAL_BASIS_ITEMS = Object.freeze([
  'Constituicao Federal de 1988',
  'LDB - Lei no 9.394/1996',
  'ECA - Lei no 8.069/1990',
  'LBI - Lei no 13.146/2015',
  'Decreto no 6.949/2009',
  'Decreto no 7.611/2011',
  'Resolucao CNE/CEB no 4/2009',
  'Politica Nacional de Educacao Especial na Perspectiva da Educacao Inclusiva',
  'Lei no 12.764/2012',
  'Lei no 14.624/2023',
  'LGPD - Lei no 13.709/2018',
  'Decreto no 12.686/2025',
  'Portaria MEC no 421/2026',
] as const);

export const FORMAL_LEGAL_BASIS_TEXT = FORMAL_LEGAL_BASIS_ITEMS.join('; ');

export type FormalPdfTypographyRole =
  | 'mainTitle'
  | 'subtitle'
  | 'sectionTitle'
  | 'fieldLabel'
  | 'body'
  | 'smallBody'
  | 'footer'
  | 'validation';

export interface FormalPdfContext {
  doc: FormalPdfDocLike;
  y: number;
  pageNumber: number;
  layout: typeof FORMAL_PDF_LAYOUT;
  colors: typeof FORMAL_PDF_COLORS;
  typography: typeof FORMAL_PDF_TYPOGRAPHY;
}

export interface FormalPdfHeaderOptions {
  title: string;
  subtitle?: string;
  schoolName?: string;
  agencyName?: string;
  documentCode?: string;
  generatedAt?: string;
  logoDataUrl?: string;
  qrDataUrl?: string;
}

export interface FormalPdfFooterOptions {
  documentCode?: string;
  generatedBy?: string;
  generatedAt?: string;
  systemName?: string;
  validationUrl?: string;
  pageNumber?: number;
  totalPages?: number;
}

export interface FormalPdfValidationOptions {
  code: string;
  label?: string;
  validationUrl?: string;
  qrDataUrl?: string;
}

export interface FormalPdfLegalBasisOptions {
  title?: string;
  items?: readonly string[];
  text?: string;
}

export interface FormalPdfSignature {
  name?: string;
  role: string;
  label?: string;
}

export interface FormalPdfSignatureBlockOptions {
  title?: string;
  signatures: readonly FormalPdfSignature[];
  location?: string;
  date?: string;
  minLineWidth?: number;
}

export interface FormalPdfSectionTitleOptions {
  title: string;
  number?: string | number;
  reserveAfter?: number;
}

export interface FormalPdfFieldBlockOptions {
  label: string;
  value: string | string[] | null | undefined;
  emptyText?: string;
  reserveAfter?: number;
}

export function createFormalPdfContext(doc: FormalPdfDocLike): FormalPdfContext {
  return {
    doc,
    y: FORMAL_PDF_LAYOUT.contentTop,
    pageNumber: currentPageNumber(doc),
    layout: FORMAL_PDF_LAYOUT,
    colors: FORMAL_PDF_COLORS,
    typography: FORMAL_PDF_TYPOGRAPHY,
  };
}

export function normalizeFormalPdfText(value: unknown, fallback = ''): string {
  const text = String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text || fallback;
}

export function setFormalPdfColor(
  doc: FormalPdfDocLike,
  method: 'text' | 'draw' | 'fill',
  color: FormalPdfRgb,
): void {
  if (method === 'text') doc.setTextColor(color[0], color[1], color[2]);
  if (method === 'draw') doc.setDrawColor(color[0], color[1], color[2]);
  if (method === 'fill') doc.setFillColor(color[0], color[1], color[2]);
}

export function applyFormalPdfTypography(
  doc: FormalPdfDocLike,
  role: FormalPdfTypographyRole,
  style: 'normal' | 'bold' | 'italic' = 'normal',
): void {
  const t = FORMAL_PDF_TYPOGRAPHY;
  const sizeByRole: Record<FormalPdfTypographyRole, number> = {
    mainTitle: t.mainTitleSize,
    subtitle: t.subtitleSize,
    sectionTitle: t.sectionTitleSize,
    fieldLabel: t.fieldLabelSize,
    body: t.bodySize,
    smallBody: t.smallBodySize,
    footer: t.footerSize,
    validation: t.validationSize,
  };
  doc.setFont(t.fontFamily, style);
  doc.setFontSize(sizeByRole[role]);
}

export function formalPdfPageWidth(doc: FormalPdfDocLike): number {
  return doc.internal.pageSize.getWidth?.() ?? doc.internal.pageSize.width ?? FORMAL_PDF_PAGE.width;
}

export function formalPdfPageHeight(doc: FormalPdfDocLike): number {
  return doc.internal.pageSize.getHeight?.() ?? doc.internal.pageSize.height ?? FORMAL_PDF_PAGE.height;
}

export function currentPageNumber(doc: FormalPdfDocLike): number {
  return doc.internal.getCurrentPageInfo?.().pageNumber ?? 1;
}

export function totalPageCount(doc: FormalPdfDocLike): number {
  return doc.internal.getNumberOfPages?.() ?? 1;
}

export function ensureSpace(
  ctx: FormalPdfContext,
  requiredHeight: number,
  options: { reserveAfter?: number; onNewPage?: (ctx: FormalPdfContext) => void } = {},
): FormalPdfContext {
  const needed = requiredHeight + (options.reserveAfter ?? 0);
  if (ctx.y + needed <= ctx.layout.contentBottom) return ctx;

  ctx.doc.addPage();
  ctx.pageNumber = currentPageNumber(ctx.doc);
  ctx.y = ctx.layout.contentTop;
  options.onNewPage?.(ctx);
  return ctx;
}

export function addPageWithHeaderFooter(
  ctx: FormalPdfContext,
  header?: FormalPdfHeaderOptions,
  footer?: FormalPdfFooterOptions,
): FormalPdfContext {
  if (footer) renderFormalFooter(ctx, footer);
  ctx.doc.addPage();
  ctx.pageNumber = currentPageNumber(ctx.doc);
  ctx.y = header ? renderFormalHeader(ctx, header) : ctx.layout.contentTop;
  return ctx;
}

export function renderFormalHeader(ctx: FormalPdfContext, options: FormalPdfHeaderOptions): number {
  const { doc, layout, colors } = ctx;
  const width = formalPdfPageWidth(doc);
  const left = layout.marginLeft;
  const right = width - layout.marginRight;
  const centerX = width / 2;
  const topY = 12;
  const logoSize = 16;
  const qrSize = options.qrDataUrl ? 18 : 0;
  const titleMaxWidth = qrSize ? 108 : 124;

  setFormalPdfColor(doc, 'text', colors.text);
  applyFormalPdfTypography(doc, 'footer', 'normal');
  if (options.logoDataUrl && doc.addImage) {
    safeAddImage(doc, options.logoDataUrl, left, topY, logoSize, logoSize);
  } else {
    setFormalPdfColor(doc, 'draw', colors.border);
    doc.setLineWidth(layout.ruleWidth);
    doc.rect(left, topY, logoSize, logoSize);
    applyFormalPdfTypography(doc, 'footer', 'normal');
    setFormalPdfColor(doc, 'text', colors.subtleText);
    doc.text('LOGO', left + logoSize / 2, topY + 9.5, { align: 'center' });
  }

  const schoolName = normalizeFormalPdfText(options.schoolName, 'Unidade Escolar');
  const agencyName = normalizeFormalPdfText(options.agencyName, 'Secretaria / Orgao Educacional');
  const title = normalizeFormalPdfText(options.title, 'Documento');

  applyFormalPdfTypography(doc, 'footer', 'normal');
  setFormalPdfColor(doc, 'text', colors.mutedText);
  doc.text(doc.splitTextToSize(agencyName, 46).slice(0, 2), right, topY + 3, { align: 'right' });

  applyFormalPdfTypography(doc, 'subtitle', 'bold');
  setFormalPdfColor(doc, 'text', colors.text);
  doc.text(doc.splitTextToSize(schoolName.toUpperCase(), titleMaxWidth).slice(0, 2), centerX, topY + 4, { align: 'center' });

  applyFormalPdfTypography(doc, 'mainTitle', 'bold');
  doc.text(doc.splitTextToSize(title.toUpperCase(), titleMaxWidth).slice(0, 3), centerX, topY + 14, { align: 'center' });

  if (options.subtitle) {
    applyFormalPdfTypography(doc, 'subtitle', 'normal');
    setFormalPdfColor(doc, 'text', colors.mutedText);
    doc.text(doc.splitTextToSize(normalizeFormalPdfText(options.subtitle), titleMaxWidth).slice(0, 2), centerX, topY + 25, { align: 'center' });
  }

  if (options.qrDataUrl && doc.addImage) {
    safeAddImage(doc, options.qrDataUrl, right - qrSize, topY + 15, qrSize, qrSize);
  }

  if (options.documentCode) {
    applyFormalPdfTypography(doc, 'validation', 'normal');
    setFormalPdfColor(doc, 'text', colors.primary);
    doc.text(options.documentCode, right, topY + 38, { align: 'right' });
  }

  setFormalPdfColor(doc, 'draw', colors.divider);
  doc.setLineWidth(layout.ruleWidth);
  doc.line(left, 54, right, 54);
  ctx.y = 63;
  return ctx.y;
}

export function renderFormalFooter(ctx: FormalPdfContext, options: FormalPdfFooterOptions = {}): void {
  const { doc, layout, colors } = ctx;
  const width = formalPdfPageWidth(doc);
  const height = formalPdfPageHeight(doc);
  const left = layout.marginLeft;
  const right = width - layout.marginRight;
  const footerY = height - 18;
  const page = options.pageNumber ?? currentPageNumber(doc);
  const total = options.totalPages ?? totalPageCount(doc);

  setFormalPdfColor(doc, 'draw', colors.divider);
  doc.setLineWidth(layout.ruleWidth);
  doc.line(left, footerY, right, footerY);

  applyFormalPdfTypography(doc, 'footer', 'normal');
  setFormalPdfColor(doc, 'text', colors.mutedText);
  doc.text(options.systemName ?? 'IncluiAI', left, footerY + 5);
  doc.text(`Pagina ${page} de ${total}`, right, footerY + 5, { align: 'right' });

  if (options.documentCode) {
    setFormalPdfColor(doc, 'text', colors.primary);
    doc.text(`Codigo: ${options.documentCode}`, width / 2, footerY + 5, { align: 'center' });
  }

  const meta = [options.generatedBy && `Gerado por: ${options.generatedBy}`, options.generatedAt].filter(Boolean).join(' | ');
  if (meta) {
    setFormalPdfColor(doc, 'text', colors.subtleText);
    doc.text(doc.splitTextToSize(meta, right - left)[0] ?? meta, left, footerY + 9);
  }
}

export function renderValidationBlock(ctx: FormalPdfContext, options: FormalPdfValidationOptions): number {
  const { doc, layout, colors } = ctx;
  const x = layout.marginLeft;
  const width = layout.contentWidth;
  const qrSize = options.qrDataUrl ? 22 : 0;
  const blockHeight = qrSize ? 34 : 24;
  ensureSpace(ctx, blockHeight, { reserveAfter: FORMAL_PDF_SPACING.md });

  setFormalPdfColor(doc, 'fill', colors.primarySoft);
  setFormalPdfColor(doc, 'draw', colors.border);
  roundedRect(doc, x, ctx.y, width, blockHeight, layout.radiusMedium, 'FD');

  applyFormalPdfTypography(doc, 'validation', 'bold');
  setFormalPdfColor(doc, 'text', colors.primary);
  doc.text(options.label ?? 'Validacao do documento', x + 5, ctx.y + 7);

  applyFormalPdfTypography(doc, 'validation', 'normal');
  setFormalPdfColor(doc, 'text', colors.text);
  doc.text(`Codigo: ${options.code}`, x + 5, ctx.y + 14);
  if (options.validationUrl) {
    setFormalPdfColor(doc, 'text', colors.mutedText);
    doc.text(doc.splitTextToSize(options.validationUrl, width - qrSize - 14)[0] ?? options.validationUrl, x + 5, ctx.y + 20);
  }

  if (options.qrDataUrl && doc.addImage) {
    safeAddImage(doc, options.qrDataUrl, x + width - qrSize - 5, ctx.y + 6, qrSize, qrSize);
  }

  ctx.y += blockHeight + FORMAL_PDF_SPACING.md;
  return ctx.y;
}

export function renderLegalBasisBlock(ctx: FormalPdfContext, options: FormalPdfLegalBasisOptions = {}): number {
  const text = normalizeFormalPdfText(options.text, (options.items ?? FORMAL_LEGAL_BASIS_ITEMS).join('; '));
  const { doc, layout, colors, typography } = ctx;
  const x = layout.marginLeft;
  const width = layout.contentWidth;
  const lines = doc.splitTextToSize(text, width - 8);
  const height = 13 + lines.length * typography.smallLineHeight;

  ensureSpace(ctx, height, { reserveAfter: FORMAL_PDF_SPACING.md });
  setFormalPdfColor(doc, 'fill', colors.accentSoft);
  setFormalPdfColor(doc, 'draw', colors.border);
  roundedRect(doc, x, ctx.y, width, height, layout.radiusMedium, 'FD');

  applyFormalPdfTypography(doc, 'fieldLabel', 'bold');
  setFormalPdfColor(doc, 'text', colors.primary);
  doc.text(options.title ?? 'Base legal', x + 4, ctx.y + 6);

  applyFormalPdfTypography(doc, 'smallBody', 'normal');
  setFormalPdfColor(doc, 'text', colors.mutedText);
  doc.text(lines, x + 4, ctx.y + 12);

  ctx.y += height + FORMAL_PDF_SPACING.md;
  return ctx.y;
}

export function renderSignatureBlock(ctx: FormalPdfContext, options: FormalPdfSignatureBlockOptions): number {
  const { doc, layout, colors } = ctx;
  const signatures = options.signatures.filter(sig => sig.role || sig.name || sig.label).slice(0, 4);
  const rows = signatures.length > 2 ? 2 : 1;
  const blockHeight = 18 + rows * 28 + (options.date || options.location ? 8 : 0);
  const x = layout.marginLeft;
  const width = layout.contentWidth;

  ensureSpace(ctx, blockHeight, { reserveAfter: FORMAL_PDF_SPACING.md });

  applyFormalPdfTypography(doc, 'sectionTitle', 'bold');
  setFormalPdfColor(doc, 'text', colors.primary);
  doc.text(options.title ?? 'Registro e assinaturas', x, ctx.y + 3);

  applyFormalPdfTypography(doc, 'footer', 'normal');
  setFormalPdfColor(doc, 'text', colors.mutedText);
  const dateLine = [options.location, options.date].filter(Boolean).join(' - ');
  if (dateLine) doc.text(dateLine, x, ctx.y + 9);

  const cols = signatures.length === 1 ? 1 : 2;
  const colWidth = cols === 1 ? Math.min(90, width) : (width - 12) / 2;
  const startX = cols === 1 ? x + (width - colWidth) / 2 : x;
  let lineY = ctx.y + 27;

  signatures.forEach((signature, index) => {
    const col = cols === 1 ? 0 : index % 2;
    const row = cols === 1 ? index : Math.floor(index / 2);
    const sigX = startX + col * (colWidth + 12);
    const sigY = lineY + row * 28;
    const lineWidth = Math.max(options.minLineWidth ?? 58, colWidth - 8);

    setFormalPdfColor(doc, 'draw', colors.border);
    doc.setLineWidth(layout.ruleWidth);
    doc.line(sigX, sigY, sigX + lineWidth, sigY);
    applyFormalPdfTypography(doc, 'footer', 'bold');
    setFormalPdfColor(doc, 'text', colors.text);
    doc.text(doc.splitTextToSize(signature.name || signature.label || 'Assinatura', lineWidth).slice(0, 1), sigX + lineWidth / 2, sigY + 5, { align: 'center' });
    applyFormalPdfTypography(doc, 'footer', 'normal');
    setFormalPdfColor(doc, 'text', colors.mutedText);
    doc.text(doc.splitTextToSize(signature.role, lineWidth).slice(0, 1), sigX + lineWidth / 2, sigY + 9, { align: 'center' });
  });

  ctx.y += blockHeight + FORMAL_PDF_SPACING.md;
  lineY = ctx.y;
  return lineY;
}

export function renderSectionTitle(ctx: FormalPdfContext, options: FormalPdfSectionTitleOptions): number {
  const { doc, layout, colors } = ctx;
  const title = normalizeFormalPdfText(options.title, 'Secao');
  const label = options.number ? `${options.number}. ${title}` : title;
  const height = 10;

  ensureSpace(ctx, height + (options.reserveAfter ?? 14));
  setFormalPdfColor(doc, 'fill', colors.sectionFill);
  doc.rect(layout.marginLeft, ctx.y, layout.contentWidth, height, 'F');
  setFormalPdfColor(doc, 'fill', colors.primary);
  doc.rect(layout.marginLeft, ctx.y, 1.3, height, 'F');

  applyFormalPdfTypography(doc, 'sectionTitle', 'bold');
  setFormalPdfColor(doc, 'text', colors.text);
  doc.text(doc.splitTextToSize(label, layout.contentWidth - 8).slice(0, 1), layout.marginLeft + 5, ctx.y + 6.8);

  ctx.y += height + FORMAL_PDF_SPACING.fieldGap;
  return ctx.y;
}

export function renderFieldBlock(ctx: FormalPdfContext, options: FormalPdfFieldBlockOptions): number {
  const { doc, layout, colors, typography } = ctx;
  const label = normalizeFormalPdfText(options.label, 'Campo');
  const value = Array.isArray(options.value)
    ? options.value.map(item => normalizeFormalPdfText(item)).filter(Boolean).join('\n')
    : normalizeFormalPdfText(options.value, options.emptyText ?? 'Nao informado');
  const lines = doc.splitTextToSize(value, layout.contentWidth);
  const height = 7 + Math.max(1, lines.length) * typography.bodyLineHeight;

  ensureSpace(ctx, height, { reserveAfter: options.reserveAfter ?? FORMAL_PDF_SPACING.fieldGap });

  applyFormalPdfTypography(doc, 'fieldLabel', 'bold');
  setFormalPdfColor(doc, 'text', colors.primary);
  doc.text(label, layout.marginLeft, ctx.y);
  ctx.y += 5.5;

  applyFormalPdfTypography(doc, 'body', 'normal');
  setFormalPdfColor(doc, 'text', colors.text);
  doc.text(lines, layout.marginLeft, ctx.y);
  ctx.y += Math.max(1, lines.length) * typography.bodyLineHeight + FORMAL_PDF_SPACING.fieldGap;
  return ctx.y;
}

function roundedRect(
  doc: FormalPdfDocLike,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  style: string,
): void {
  if (doc.roundedRect) {
    doc.roundedRect(x, y, width, height, radius, radius, style);
    return;
  }
  doc.rect(x, y, width, height, style);
}

function safeAddImage(doc: FormalPdfDocLike, dataUrl: string, x: number, y: number, width: number, height: number): boolean {
  if (!doc.addImage) return false;
  try {
    const format = dataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
    doc.addImage(dataUrl, format, x, y, width, height, undefined, 'FAST');
    return true;
  } catch {
    return false;
  }
}
