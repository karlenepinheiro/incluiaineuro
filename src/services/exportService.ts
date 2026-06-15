// exportService.ts — Ficha do Aluno (documento interno) + Relatório Evolutivo
// IncluiAI — Redesign Institucional v3
// Regra: Ficha = documento INTERNO → sem QR, sem URL pública, sem dados técnicos de IA
//        Relatório Evolutivo = documento OFICIAL → mantém QR + URL de validação
import { Student, StudentEvolution, DocField, SchoolConfig } from "../types";
import { ensureDocumentCode, generateDocumentCode, INCLUIAI_SITE } from '../utils/documentCodes';

// ─── Carrega jsPDF dinamicamente (CDN) ────────────────────────────────────────
async function loadJsPDF(): Promise<any> {
  if ((window as any).jspdf?.jsPDF) return (window as any).jspdf.jsPDF;
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src =
      "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Falha ao carregar jsPDF"));
    document.head.appendChild(script);
  });
  return (window as any).jspdf.jsPDF;
}

// ─── Paleta de cores ──────────────────────────────────────────────────────────
const BRAND       = [31,  78,  95 ] as [number,number,number]; // petrol #1F4E5F
const BRAND_DARK  = [28,  32,  46 ] as [number,number,number]; // dark   #1C202E
const BRAND_LIGHT = [236, 244, 247] as [number,number,number]; // petrol light
const DARK        = [28,  32,  46 ] as [number,number,number];
const GRAY        = [108, 117, 125] as [number,number,number];
const GOLD        = [198, 146, 20 ] as [number,number,number]; // #C69214
const BORDER      = [218, 224, 229] as [number,number,number];
const WHITE       = [255, 255, 255] as [number,number,number];
const GBKG        = [248, 249, 250] as [number,number,number];
const AMBER_BG    = [255, 251, 235] as [number,number,number]; // amber-50
const AMBER_TXT   = [120,  53,  15] as [number,number,number]; // amber-900

// ─── Margens ──────────────────────────────────────────────────────────────────
// Ficha do Aluno — documento interno (margens 1,5 cm, A4 210×297 mm → área 180×267 mm)
const FL = 15;            // margem esquerda da ficha
const FR = 15;            // margem direita da ficha
const FICHA_FOOTER_H = 12;// altura rodapé interno
const FICHA_HDR_H    = 12;// altura cabeçalho corrente

// Relatório Evolutivo — padrão ABNT
const ML           = 30;
const MR           = 20;
const FOOTER_H     = 16;
const BOTTOM_MARGIN = 20;
const CONTENT_TOP  = 30;
// CONTENT_TOP_INST reserved for future use

// Tipografia da Ficha
const F_TITLE_SIZE   = 16;
const F_SECTION_SIZE = 11;
const F_BODY_SIZE    = 10;
const F_LABEL_SIZE   = 9.5;
const F_TABLE_SIZE   = 9;
const F_SMALL_SIZE   = 8;
const F_TINY_SIZE    = 7.5;
const F_LINE_H       = 5.0;
const F_LINE_H_LIST  = 4.5;

// ─── Micro-helpers ────────────────────────────────────────────────────────────
const sc  = (d: any, c: [number,number,number]) => d.setTextColor(...c);
const sf  = (d: any, c: [number,number,number]) => d.setFillColor(...c);
const sdd = (d: any, c: [number,number,number]) => d.setDrawColor(...c);

function fichaBottom(H: number): number { return H - 10 - FICHA_FOOTER_H; }
function contentBottom(H: number): number { return H - BOTTOM_MARGIN - FOOTER_H; }

function calcAge(birthDate?: string): string {
  if (!birthDate) return '';
  let d: number, m: number, y: number;
  if (birthDate.includes('/')) {
    // DD/MM/YYYY
    const p = birthDate.split('/').map(Number);
    [d, m, y] = [p[0], p[1], p[2]];
  } else {
    // YYYY-MM-DD (ISO) — year is first token
    const p = birthDate.split('-').map(Number);
    [y, m, d] = [p[0], p[1], p[2]];
  }
  if (!y || y < 100 || !m) return '';
  const today = new Date();
  let age = today.getFullYear() - y;
  const notYet = today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d);
  if (notYet) age--;
  return age >= 0 ? `${age} anos` : '';
}

function placeholder(val?: string | null, msg = 'Não informado'): string {
  const s = String(val ?? '').trim();
  return s || msg;
}

function getInitials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (!p.length) return '?';
  if (p.length === 1) return p[0][0].toUpperCase();
  return (p[0][0] + p[p.length - 1][0]).toUpperCase();
}

// ─── Helpers compartilhados ───────────────────────────────────────────────────
function makeAuditCode(_prefix: string, _id: string): string {
  return generateDocumentCode('registration');
}

function addWrappedText(
  doc: any, text: string, x: number, y: number,
  maxWidth: number, lineHeight: number,
): number {
  const lines = doc.splitTextToSize(text || "—", maxWidth);
  doc.text(lines, x, y);
  return y + lines.length * lineHeight;
}

// ─── Crop circular de foto (Canvas) ──────────────────────────────────────────
async function resolvePhotoUrl(photoUrl: string): Promise<string> {
  if (!photoUrl) throw new Error('empty');
  if (photoUrl.startsWith('data:')) return photoUrl;
  const resp = await fetch(photoUrl, { mode: 'cors' });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const blob = await resp.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function cropCircle(photoUrl: string): Promise<string> {
  const dataUrl = await resolvePhotoUrl(photoUrl);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const size = Math.min(img.width, img.height);
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext('2d')!;
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(img, -(img.width - size) / 2, -(img.height - size) / 2, img.width, img.height);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

// ════════════════════════════════════════════════════════════════════════════
// PREMIUM FICHA HELPERS — Painel Pedagógico Visual
// Espírito do preview_ficha_aluno_premium — implementado em jsPDF
// ════════════════════════════════════════════════════════════════════════════

// Paleta premium (complementa a paleta geral)
const PF_GREEN_BG   = [236, 253, 245] as [number,number,number]; // emerald-50
const PF_GREEN_TXT  = [  4, 120,  87] as [number,number,number]; // emerald-700
const PF_GREEN_BD   = [167, 243, 208] as [number,number,number]; // emerald-200
const PF_ORANGE_BG  = [255, 247, 237] as [number,number,number]; // orange-50
const PF_ORANGE_TXT = [194,  65,  12] as [number,number,number]; // orange-700
const PF_ORANGE_BD  = [254, 215, 170] as [number,number,number]; // orange-200
const PF_ORANGE_ACC = [251, 146,  60] as [number,number,number]; // orange-400 (barra acento hero)
const PF_BLUE_BG    = [239, 246, 255] as [number,number,number]; // blue-50
const PF_BLUE_TXT   = [ 29,  78, 216] as [number,number,number]; // blue-700
const PF_BLUE_BD    = [191, 219, 254] as [number,number,number]; // blue-200
const PF_SL100      = [241, 245, 249] as [number,number,number]; // slate-100
const PF_SL200      = [226, 232, 240] as [number,number,number]; // slate-200
const PF_SL400      = [148, 163, 184] as [number,number,number]; // slate-400
const PF_SL500      = [100, 116, 139] as [number,number,number]; // slate-500
const PF_SL700      = [ 51,  65,  85] as [number,number,number]; // slate-700
const PF_SL800      = [ 30,  41,  59] as [number,number,number]; // slate-800
const PF_SL900      = [ 15,  23,  42] as [number,number,number]; // slate-900

/** Valor normalizado — retorna fallback se vazio. */
function pf_val(v: any, fallback = 'Não informado'): string {
  return String(v ?? '').trim() || fallback;
}

/** Cabeçalho corrente — páginas 2+ da Ficha Premium. */
function pf_header(
  doc: any, studentName: string, _code: string, school?: SchoolConfig | null,
): number {
  const W  = doc.internal.pageSize.getWidth();
  const sn = school?.schoolName?.trim() || 'Escola não informada';
  doc.setFont('helvetica', 'bold');   doc.setFontSize(8);   sc(doc, PF_SL900);
  doc.text(sn.toUpperCase(), FL, 7.5);
  const shortName = studentName.length > 28 ? studentName.split(' ').slice(0, 2).join(' ') : studentName;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); sc(doc, PF_SL500);
  doc.text(`FICHA DO ALUNO — ${shortName}`, W / 2, 7.5, { align: 'center' });
  doc.setFont('helvetica', 'bold');   doc.setFontSize(8.5); sc(doc, BRAND as [number,number,number]);
  doc.text('IncluiAI', W - FR, 7.5, { align: 'right' });
  sdd(doc, PF_SL200); doc.setLineWidth(0.25);
  doc.line(FL, 10.5, W - FR, 10.5);
  return 13;
}

/** Rodapé limpo — sem QR, sem URL pública. */
function pf_footer(doc: any, code: string, emittedBy: string): void {
  const W   = doc.internal.pageSize.getWidth();
  const H   = doc.internal.pageSize.getHeight();
  const fY  = H - 10 - FICHA_FOOTER_H;
  const pN  = doc.internal.getCurrentPageInfo().pageNumber;
  const pT  = doc.internal.getNumberOfPages();
  const cleanBy  = (emittedBy || '').replace(/\s*(MASTER|PRO|FREE|PREMIUM|INSTITUTIONAL)\s*/gi, '').trim() || emittedBy;
  const emitDate = new Date().toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  sdd(doc, PF_SL200); doc.setLineWidth(0.25);
  doc.line(FL, fY, W - FR, fY);
  // Esquerda: nota de uso interno
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7);   sc(doc, PF_SL400);
  doc.text('Documento pedagógico — uso interno', FL, fY + 4.5);
  // Centro: marca IncluiAI + site
  doc.setFont('helvetica', 'bold');   doc.setFontSize(8);   sc(doc, BRAND as [number,number,number]);
  doc.text('IncluiAI', W / 2, fY + 3.5, { align: 'center' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); sc(doc, PF_SL400);
  doc.text('www.incluiai.app.br', W / 2, fY + 8, { align: 'center' });
  // Direita: número de página
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7);   sc(doc, PF_SL500);
  doc.text(`Página ${pN} de ${pT}`, W - FR, fY + 4.5, { align: 'right' });
  // Segunda linha
  doc.setFontSize(6.5); sc(doc, PF_SL400);
  if (cleanBy) doc.text(`Emitido por: ${cleanBy}  ·  ${emitDate}`, FL, fY + 8.5);
  doc.setFont('courier', 'normal'); sc(doc, BRAND as [number,number,number]);
  doc.text(`Cód.: ${code}`, W - FR, fY + 8.5, { align: 'right' });
}

function pf_footerAllPages(doc: any, code: string, emittedBy: string): void {
  const n = doc.internal.getNumberOfPages();
  for (let i = 1; i <= n; i++) { doc.setPage(i); pf_footer(doc, code, emittedBy); }
}

/** Y máximo disponível antes do rodapé. */
function pf_pfBottom(H: number): number { return H - 10 - FICHA_FOOTER_H; }

/** Título de seção: badge azul quadrado + título bold. */
function pf_sectionTitle(
  doc: any, symbol: string, title: string, x: number, y: number,
): number {
  const sz = 8;
  sf(doc, PF_BLUE_BG); sdd(doc, PF_BLUE_BD); doc.setLineWidth(0.25);
  doc.roundedRect(x, y, sz, sz, 1.5, 1.5, 'FD');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); sc(doc, PF_BLUE_TXT);
  doc.text(symbol, x + sz / 2, y + sz / 2 + 1.2, { align: 'center' });
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12); sc(doc, PF_SL900);
  doc.text(title, x + sz + 3, y + sz - 1);
  return y + sz + 4;
}

/** Calcula altura de uma lista de chips sem desenhar. */
function pf_measureChipList(doc: any, items: string[], maxW: number): number {
  const arr = (items || []).map(i => String(i ?? '').trim()).filter(Boolean);
  if (!arr.length) return 0;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
  const chipH = 6, padX = 3.5, gapX = 2.5, gapY = 2.5;
  let cx = 0, rows = 1;
  for (const item of arr) {
    const chipW = doc.getTextWidth(item) + padX * 2;
    if (cx > 0 && cx + chipW > maxW) { cx = 0; rows++; }
    cx += chipW + gapX;
  }
  return rows * (chipH + gapY);
}

/** Lista de chips coloridos com quebra de linha automática. */
function pf_chipList(
  doc: any, items: any[], x: number, y: number, maxW: number,
  tone: 'blue' | 'green' | 'orange' = 'blue',
): number {
  const arr = (items || []).map(i => String(i ?? '').trim()).filter(Boolean);
  if (!arr.length) {
    doc.setFont('helvetica', 'italic'); doc.setFontSize(8.5); sc(doc, PF_SL400);
    doc.text('Em preenchimento', x, y + 5);
    return y + 10;
  }
  const bg  = tone === 'green' ? PF_GREEN_BG  : tone === 'orange' ? PF_ORANGE_BG  : PF_BLUE_BG;
  const txt = tone === 'green' ? PF_GREEN_TXT : tone === 'orange' ? PF_ORANGE_TXT : PF_BLUE_TXT;
  const bd  = tone === 'green' ? PF_GREEN_BD  : tone === 'orange' ? PF_ORANGE_BD  : PF_BLUE_BD;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
  const chipH = 6, padX = 3.5, gapX = 2.5, gapY = 2.5;
  let cx = x;
  for (const item of arr) {
    const chipW = doc.getTextWidth(item) + padX * 2;
    if (cx > x && cx + chipW > x + maxW) { cx = x; y += chipH + gapY; }
    sf(doc, bg); sdd(doc, bd); doc.setLineWidth(0.25);
    doc.roundedRect(cx, y, chipW, chipH, 1.5, 1.5, 'FD');
    sc(doc, txt); doc.text(item, cx + padX, y + chipH - 1.5);
    cx += chipW + gapX;
  }
  return y + chipH + 2;
}

/** Card de campo único: label cinza pequeno (caps) + valor bold. */
function pf_fieldCard(
  doc: any, label: string, value: string,
  x: number, y: number, w: number, h = 16,
): void {
  sf(doc, WHITE); sdd(doc, PF_SL200); doc.setLineWidth(0.25);
  doc.roundedRect(x, y, w, h, 2, 2, 'FD');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); sc(doc, PF_SL400);
  doc.text(label.toUpperCase(), x + 4, y + 5.5);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); sc(doc, PF_SL800);
  const vLines = doc.splitTextToSize(String(value || '—'), w - 8) as string[];
  doc.text(vLines[0] || '—', x + 4, y + 11);
}

/** Grid de cards de campo em N colunas. */
function pf_infoGrid(
  doc: any, fields: Array<[string, string]>,
  x: number, y: number, maxW: number, cols = 3,
): number {
  const fH = 16, gX = 3, gY = 3;
  const cW = (maxW - gX * (cols - 1)) / cols;
  fields.forEach(([label, value], i) => {
    pf_fieldCard(
      doc, label, pf_val(value),
      x + (i % cols) * (cW + gX),
      y + Math.floor(i / cols) * (fH + gY),
      cW, fH,
    );
  });
  return y + Math.ceil(fields.length / cols) * (fH + gY) + 1;
}

/** Dois cards de chips lado a lado com altura igualada. */
function pf_twoChipCards(
  doc: any,
  left:  { title: string; chips: string[]; tone: 'green' | 'orange' },
  right: { title: string; chips: string[]; tone: 'green' | 'orange' },
  x: number, y: number, maxW: number,
): number {
  const cW     = (maxW - 4) / 2;
  const titleH = 10;
  const lH     = pf_measureChipList(doc, left.chips,  cW - 8);
  const rH     = pf_measureChipList(doc, right.chips, cW - 8);
  const cardH  = Math.max(28, titleH + Math.max(lH, rH) + 8);

  const drawCard = (cx: number, t: typeof left) => {
    const bd  = t.tone === 'green' ? PF_GREEN_BD  : PF_ORANGE_BD;
    const clr = t.tone === 'green' ? PF_GREEN_TXT : PF_ORANGE_TXT;
    sf(doc, WHITE); sdd(doc, bd); doc.setLineWidth(0.25);
    doc.roundedRect(cx, y, cW, cardH, 2, 2, 'FD');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); sc(doc, clr);
    doc.text(t.title, cx + 4, y + 8);
    pf_chipList(doc, t.chips, cx + 4, y + titleH, cW - 8, t.tone);
  };
  drawCard(x, left);
  drawCard(x + cW + 4, right);
  return y + cardH + 3;
}

/** Dois cards de texto corrido lado a lado. */
function pf_twoTextCards(
  doc: any,
  left:  { title: string; text: string },
  right: { title: string; text: string },
  x: number, y: number, maxW: number,
): number {
  const cW     = (maxW - 4) / 2;
  const titleH = 10;
  const lh     = 4.2;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
  const lLines = doc.splitTextToSize(left.text  || '—', cW - 8) as string[];
  const rLines = doc.splitTextToSize(right.text || '—', cW - 8) as string[];
  const cardH  = Math.max(28, titleH + Math.max(lLines.length, rLines.length) * lh + 6);

  const drawCard = (cx: number, t: typeof left, lines: string[]) => {
    sf(doc, WHITE); sdd(doc, PF_SL200); doc.setLineWidth(0.25);
    doc.roundedRect(cx, y, cW, cardH, 2, 2, 'FD');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); sc(doc, PF_SL900);
    doc.text(t.title, cx + 4, y + 8);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); sc(doc, PF_SL700);
    doc.text(lines, cx + 4, y + titleH + lh);
  };
  drawCard(x,         left,  lLines);
  drawCard(x + cW + 4, right, rLines);
  return y + cardH + 3;
}

/** Barra de progresso: fundo cinza + preenchimento colorido. */
function pf_progressBar(
  doc: any, pct: number, x: number, y: number, w: number,
  fillColor: [number,number,number] = PF_BLUE_TXT,
): void {
  const barH = 2.5, v = Math.max(0, Math.min(100, pct));
  sf(doc, PF_SL200); doc.roundedRect(x, y, w, barH, 1, 1, 'F');
  if (v > 0) { sf(doc, fillColor); doc.roundedRect(x, y, w * v / 100, barH, 1, 1, 'F'); }
}

// (helpers antigos removidos — substituídos pelos pf_ acima)
function addFichaHeader_UNUSED(
  doc: any,
  studentName: string,
  internalCode: string,
  school?: SchoolConfig | null,
): number {
  const W = doc.internal.pageSize.getWidth();
  const schoolLabel = school?.schoolName?.trim() || 'Escola não informada';

  // Logo institucional (7×7 mm)
  let textX = FL;
  if (school?.logoUrl) {
    try {
      const fmt = school.logoUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
      doc.addImage(school.logoUrl, fmt, FL, 1.5, 6, 6);
      textX = FL + 8;
    } catch {}
  }

  // Nome da escola (esquerda)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(F_SMALL_SIZE);
  sc(doc, DARK);
  doc.text(schoolLabel, textX, 6);

  // Título do documento (centro)
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(F_TINY_SIZE);
  sc(doc, GRAY);
  const shortName = studentName.length > 30 ? studentName.split(' ').slice(0, 2).join(' ') : studentName;
  doc.text(`FICHA DO ALUNO — ${shortName}`, W / 2, 6, { align: 'center' });

  // Código interno (direita) — NÃO é URL pública
  doc.setFont('courier', 'normal');
  doc.setFontSize(F_TINY_SIZE);
  sc(doc, GRAY);
  doc.text(`Doc.: ${internalCode}`, W - FR, 6, { align: 'right' });

  // Linha separadora
  sdd(doc, BORDER);
  doc.setLineWidth(0.3);
  doc.line(FL, 10, W - FR, 10);

  return FICHA_HDR_H; // 12 mm
}

/** Rodapé de documento interno — sem QR, sem URL pública. */
function addFichaFooter(doc: any, internalCode: string, emittedBy: string): void {
  const W   = doc.internal.pageSize.getWidth();
  const H   = doc.internal.pageSize.getHeight();
  const fY  = H - 10 - FICHA_FOOTER_H;
  const pgN = doc.internal.getCurrentPageInfo().pageNumber;
  const tot = doc.internal.getNumberOfPages();

  // Dupla linha decorativa petrol + ouro
  sf(doc, BRAND);
  doc.rect(FL, fY, W - FL - FR, 0.5, 'F');
  sf(doc, GOLD);
  doc.rect(FL, fY + 0.5, W - FL - FR, 0.2, 'F');

  // Linha 1: tag institucional | marca | paginação
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(F_TINY_SIZE);
  sc(doc, GRAY);
  doc.text('Documento pedagógico para uso interno', FL, fY + 4.5);

  doc.setFont('helvetica', 'bold');
  sc(doc, BRAND);
  doc.text('INCLUIAI', W / 2, fY + 4.5, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  sc(doc, GRAY);
  doc.text(`Página ${pgN} de ${tot}`, W - FR, fY + 4.5, { align: 'right' });

  // Linha 2: emitente | código interno
  const cleanBy = (emittedBy || '').replace(/\s*(MASTER|PRO|FREE|PREMIUM|INSTITUTIONAL)\s*/gi, '').trim() || emittedBy;
  const emitDate = new Date().toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(F_TINY_SIZE - 0.5);
  sc(doc, GRAY);
  if (cleanBy) doc.text(`Emitido por: ${cleanBy}  ·  ${emitDate}`, FL, fY + 8.5);

  doc.setFont('courier', 'normal');
  doc.setFontSize(F_TINY_SIZE - 0.5);
  sc(doc, BRAND);
  doc.text(`Cód. doc.: ${internalCode}`, W - FR, fY + 8.5, { align: 'right' });
}

function addFichaFooterAllPages(doc: any, internalCode: string, emittedBy: string): void {
  const n = doc.internal.getNumberOfPages();
  for (let i = 1; i <= n; i++) { doc.setPage(i); addFichaFooter(doc, internalCode, emittedBy); }
}

/** Faixa de seção petrol (largura total) para Ficha. */
function fichaSection(doc: any, text: string, x: number, y: number, w: number): number {
  const h = 7.5;
  sf(doc, BRAND);
  doc.roundedRect(x, y, w, h, 1, 1, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(F_SECTION_SIZE);
  sc(doc, WHITE);
  doc.text(text.toUpperCase(), x + 4, y + 5.2);
  return y + h + 5;
}

/** Subseção com acento gold. */
function fichaSubSection(doc: any, text: string, x: number, y: number): number {
  sdd(doc, GOLD);
  sf(doc, GOLD);
  doc.rect(x, y, 2.5, 5.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(F_LABEL_SIZE);
  sc(doc, BRAND);
  doc.text(text, x + 5, y + 4);
  return y + 10;
}

/** Grid 2 colunas para pares chave-valor (Ficha) — suporta valores multi-linha. */
function fichaKvGrid(
  doc: any,
  pairs: Array<[string, string]>,
  x: number, y: number, maxW: number,
): number {
  const filtered = pairs.filter(([, v]) => {
    const s = String(v ?? '').trim();
    return s !== '' && s !== '—' && s !== '-';
  });
  if (!filtered.length) return y;

  const colW = (maxW - 8) / 2;
  const pad  = 4;

  // Pré-computa células: tenta inline, senão quebra linha
  doc.setFontSize(F_TABLE_SIZE);
  type Cell = { label: string; kw: number; vLines: string[]; inline: boolean; cellH: number };
  const cells: Cell[] = filtered.map(([k, v]) => {
    doc.setFont('helvetica', 'bold');
    const kw = doc.getTextWidth(k);
    const valStr = String(v || '—');
    const inlineW = colW - kw - 3;
    let inline: boolean;
    let vLines: string[];
    if (inlineW >= 18) {
      const test = doc.splitTextToSize(valStr, inlineW);
      inline = test.length === 1;
      vLines = inline ? [test[0]] : doc.splitTextToSize(valStr, colW - pad);
    } else {
      inline = false;
      vLines = doc.splitTextToSize(valStr, colW - pad);
    }
    const lineCount = inline ? 1 : 1 + vLines.length;
    return { label: k, kw, vLines, inline, cellH: lineCount * F_LINE_H + 2.5 };
  });

  // Agrupa em linhas de 2 colunas
  const rowCount = Math.ceil(cells.length / 2);
  const rowHeights: number[] = [];
  for (let r = 0; r < rowCount; r++) {
    const c0 = cells[r * 2];
    const c1 = cells[r * 2 + 1];
    rowHeights.push(Math.max(c0?.cellH ?? 0, c1?.cellH ?? 0, F_LINE_H + 2.5));
  }
  const boxH = rowHeights.reduce((s, h) => s + h, 0) + pad * 2;

  sf(doc, GBKG); sdd(doc, BORDER);
  doc.setLineWidth(0.2);
  doc.roundedRect(x, y, maxW, boxH, 2, 2, 'FD');

  doc.setFontSize(F_TABLE_SIZE);
  let curY = y + pad + 4.5;
  for (let r = 0; r < rowCount; r++) {
    const rh = rowHeights[r];
    for (let c = 0; c < 2; c++) {
      const cell = cells[r * 2 + c];
      if (!cell) continue;
      const cx = x + pad + c * (colW + 4);
      doc.setFont('helvetica', 'bold');
      sc(doc, BRAND);
      doc.text(cell.label, cx, curY);
      doc.setFont('helvetica', 'normal');
      sc(doc, DARK);
      if (cell.inline) {
        doc.text(` ${cell.vLines[0] || ''}`, cx + cell.kw, curY);
      } else {
        cell.vLines.forEach((ln, li) => {
          doc.text(ln, cx + 2, curY + (li + 1) * F_LINE_H);
        });
      }
    }
    curY += rh;
  }

  return y + boxH + 4;
}

/** Renderiza campo com label petrol + texto corpo (Ficha). */
function fichaField(
  doc: any,
  label: string,
  value: string,
  x: number, y: number, maxW: number,
  onNewPage: () => number,
): number {
  const H = doc.internal.pageSize.getHeight();
  if (y > fichaBottom(H) - 14) { y = onNewPage(); }

  if (label) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(F_LABEL_SIZE);
    sc(doc, BRAND);
    doc.text(label.toUpperCase(), x, y);
    y += 4.5;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(F_BODY_SIZE);
  sc(doc, DARK);

  const displayVal = value?.trim() || 'Não informado';
  const isPlaceholder = !value?.trim();
  if (isPlaceholder) {
    doc.setFont('helvetica', 'italic');
    sc(doc, GRAY);
  }

  const lines = doc.splitTextToSize(displayVal, maxW);
  for (const ln of lines) {
    if (y > fichaBottom(H) - 5) { y = onNewPage(); }
    doc.text(ln, x, y);
    y += F_LINE_H;
  }
  return y + 5;
}

/** Renderiza lista como bullets (•) — para habilidades, dificuldades, comunicação. */
function fichaBullets(
  doc: any, items: string[],
  x: number, y: number, maxW: number,
  onNewPage: () => number,
): number {
  const H = doc.internal.pageSize.getHeight();
  const validItems = items.filter(it => it?.trim());

  if (!validItems.length) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(F_BODY_SIZE);
    sc(doc, GRAY);
    doc.text('Em preenchimento', x, y);
    return y + F_LINE_H + 3;
  }

  const BW = 5.5; // espaço reservado para bullet
  for (const item of validItems) {
    if (y > fichaBottom(H) - 8) { y = onNewPage(); }
    // círculo desenhado (evita dependência de glifo Unicode em Helvetica)
    sf(doc, BRAND); sdd(doc, BRAND);
    doc.circle(x + 1.2, y - 1.2, 1.1, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(F_BODY_SIZE);
    sc(doc, DARK);
    const ls = doc.splitTextToSize(item.trim(), maxW - BW);
    doc.text(ls, x + BW, y);
    y += ls.length * F_LINE_H_LIST + 1.5;
  }
  return y + 5;
}

/** Renderiza lista como checks (✓) — para estratégias aplicadas e adaptações. */
function fichaChecks(
  doc: any, items: string[],
  x: number, y: number, maxW: number,
  onNewPage: () => number,
): number {
  const H = doc.internal.pageSize.getHeight();
  const validItems = items.filter(it => it?.trim());

  if (!validItems.length) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(F_BODY_SIZE);
    sc(doc, GRAY);
    doc.text('Em preenchimento', x, y);
    return y + F_LINE_H + 3;
  }

  for (const item of validItems) {
    if (y > fichaBottom(H) - 8) { y = onNewPage(); }
    // Checkbox petrol com visto desenhado (ASCII-safe)
    sf(doc, BRAND); sdd(doc, BRAND);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, y - 3.2, 4.2, 4.2, 0.6, 0.6, 'FD');
    // Visto como duas linhas (compatível com Helvetica)
    sdd(doc, WHITE);
    doc.setLineWidth(0.7);
    doc.line(x + 0.9, y - 1, x + 1.8, y + 0.4);
    doc.line(x + 1.8, y + 0.4, x + 3.5, y - 2.2);
    // Texto
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(F_BODY_SIZE);
    sc(doc, DARK);
    const ls = doc.splitTextToSize(item.trim(), maxW - 7);
    doc.text(ls, x + 7, y);
    y += ls.length * F_LINE_H_LIST + 1.5;
  }
  return y + 5;
}

/** Caixa de destaque âmbar — recomendações e encaminhamentos. */
function fichaHighlight(
  doc: any, label: string, text: string,
  x: number, y: number, maxW: number,
  onNewPage: () => number,
): number {
  if (!text?.trim()) {
    return fichaField(doc, label, '', x, y, maxW, onNewPage);
  }
  const H     = doc.internal.pageSize.getHeight();
  const inner = maxW - 8;
  const lines = doc.splitTextToSize(text.trim(), inner);
  const labelH = label ? 6 : 0;
  const boxH   = lines.length * F_LINE_H + labelH + 6;

  if (y > fichaBottom(H) - boxH - 4) { y = onNewPage(); }

  sf(doc, AMBER_BG); sdd(doc, GOLD); doc.setLineWidth(0.5);
  doc.roundedRect(x, y, maxW, boxH, 2, 2, 'FD');

  let ty = y + 5;
  if (label) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(F_LABEL_SIZE); sc(doc, AMBER_TXT);
    doc.text(label.toUpperCase(), x + 4, ty);
    ty += labelH;
  }
  doc.setFont('helvetica', 'normal'); doc.setFontSize(F_BODY_SIZE); sc(doc, DARK);
  doc.text(lines, x + 4, ty);
  return y + boxH + 4;
}

/** Capa institucional da Ficha do Aluno. Retorna Y após o bloco de capa. */
async function addStudentCover(
  doc: any,
  student: Student,
  school: SchoolConfig | null | undefined,
  internalCode: string,
  circularPhoto: string | undefined,
): Promise<number> {
  const W      = doc.internal.pageSize.getWidth();
  const maxW   = W - FL - FR;
  const bannerH = 46;
  const schoolName = school?.schoolName?.trim() || 'Escola não informada';
  const schoolIncomplete = !school?.schoolName?.trim();

  // ── BANNER PETROL ─────────────────────────────────────────────────────────
  sf(doc, BRAND);
  doc.rect(0, 0, W, bannerH, 'F');

  // ── LINHA OURO (base do banner) ───────────────────────────────────────────
  sf(doc, GOLD);
  doc.rect(0, bannerH, W, 1.5, 'F');

  // ── LOGO + NOME DA ESCOLA (topo esquerdo) ─────────────────────────────────
  let nameX = FL;
  if (school?.logoUrl) {
    try {
      const fmt = school.logoUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
      doc.addImage(school.logoUrl, fmt, FL, 2, 9, 9);
      nameX = FL + 11;
    } catch {}
  }

  const nameAreaW = W - nameX - FR - 4;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  sc(doc, WHITE);
  const snLines: string[] = doc.splitTextToSize(schoolName.toUpperCase(), nameAreaW);
  doc.text(snLines, nameX, 8);

  if (schoolIncomplete) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    sc(doc, [255, 210, 100] as [number,number,number]);
    doc.text('⚠ Finalize o cadastro da escola nas Configurações', nameX, 8 + snLines.length * 4.2);
  } else {
    const cityLine = [school?.city, school?.state].filter(Boolean).join(' – ');
    if (cityLine) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      sc(doc, [175, 210, 228] as [number,number,number]);
      doc.text(cityLine, nameX, 8 + snLines.length * 4.2);
    }
  }

  // ── LINHA OURO FINA (divisória dentro do banner) ──────────────────────────
  sf(doc, GOLD);
  doc.rect(FL, 17, maxW, 0.3, 'F');

  // ── TÍTULO DO DOCUMENTO ───────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(F_TITLE_SIZE);
  sc(doc, WHITE);
  const tLines: string[] = doc.splitTextToSize('FICHA DO ALUNO', maxW);
  doc.text(tLines, FL, 25);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  sc(doc, [175, 215, 232] as [number,number,number]);
  doc.text('Documentação Educacional Inclusiva', FL, 33);

  // Código do documento (direita, dentro do banner — não é URL de validação)
  doc.setFont('courier', 'normal');
  doc.setFontSize(7);
  sc(doc, GOLD);
  doc.text(internalCode, W - FR, 33, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  sc(doc, [175, 210, 225] as [number,number,number]);
  doc.text('Código do documento', W - FR, 37, { align: 'right' });

  // ── LINHA DE METADADOS (abaixo do banner) ─────────────────────────────────
  const metaY  = bannerH + 6;
  const nowStr = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(F_SMALL_SIZE);
  sc(doc, GRAY);
  doc.text(`Emissão: ${nowStr}`, FL, metaY);
  sdd(doc, BORDER); doc.setLineWidth(0.3);
  doc.line(FL, metaY + 4, W - FR, metaY + 4);

  // ── BLOCO DO ALUNO (foto + dados) ─────────────────────────────────────────
  let y = metaY + 10;
  const photoD = 40; // diâmetro foto capa (mm)
  const photoCX = FL + photoD / 2;
  const photoCY = y + photoD / 2;

  // Foto ou avatar
  if (circularPhoto) {
    try {
      sf(doc, BRAND); sdd(doc, BRAND);
      doc.circle(photoCX, photoCY, photoD / 2 + 1, 'F');
      doc.addImage(circularPhoto, 'PNG', FL, y, photoD, photoD, undefined, 'FAST');
    } catch {
      _drawAvatarCover(doc, student.name, photoCX, photoCY, photoD / 2);
    }
  } else {
    _drawAvatarCover(doc, student.name, photoCX, photoCY, photoD / 2);
  }

  // Dados à direita da foto
  const dataX = FL + photoD + 8;
  const dataW = W - FR - dataX;
  let dy = y + 2;

  // Nome completo (grande)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  sc(doc, BRAND_DARK);
  const nameLines: string[] = doc.splitTextToSize(student.name, dataW);
  doc.text(nameLines, dataX, dy);
  dy += nameLines.length * 5.5;

  // Linha separadora âmbar
  sf(doc, GOLD); doc.rect(dataX, dy, dataW, 0.6, 'F');
  dy += 4;

  // Dados estruturados
  const age     = calcAge(student.birthDate);
  const rawSex  = (student as any).gender || (student as any).sex || '';
  const gLabel  = rawSex === 'M' ? 'Masculino' : rawSex === 'F' ? 'Feminino' : rawSex || 'Não informado';
  const supLvl  = (student as any).supportLevel || (student as any).support_level || '';
  const diagArr = (student.diagnosis || []);
  const diagPri = diagArr.length > 0 ? diagArr[0] : '';
  const cid     = typeof student.cid === 'string'
    ? student.cid
    : Array.isArray(student.cid) ? (student.cid as string[]).join(', ') : '';
  const diagStr = [diagPri, cid].filter(Boolean).join(' – ') || 'Não informado';
  const status  = (student as any).tipo_aluno === 'com_laudo' ? 'Com Laudo' :
                  (student as any).tipo_aluno === 'em_triagem' ? 'Em Triagem' : 'Em Preenchimento';
  const shift   = student.shift || (student as any).turno || '';
  const uniqueCode = (student as any).unique_code || student.id?.slice(-8) || '';

  const coverData: Array<[string, string]> = [
    ['Cód. Aluno:',     uniqueCode || internalCode.split('-')[1]],
    ['Nascimento:',     student.birthDate || 'Não informado'],
    ['Idade:',          age || 'Não informado'],
    ['Gênero:',         gLabel],
    ['Série / Turma:',  student.grade  || 'Não informado'],
    ['Turno:',          shift          || 'Não informado'],
    ['Nível de Suporte:', supLvl       || 'Não informado'],
    ['Status:',         status],
  ];

  doc.setFontSize(F_TABLE_SIZE);
  for (const [k, v] of coverData) {
    if (dy > fichaBottom(doc.internal.pageSize.getHeight()) - 10) break;
    doc.setFont('helvetica', 'bold');
    sc(doc, BRAND);
    doc.text(k, dataX, dy);
    const kw = doc.getTextWidth(k);
    doc.setFont('helvetica', 'normal');
    sc(doc, DARK);
    const safeV = doc.splitTextToSize(v, dataW - kw - 2)[0] || v;
    doc.text(` ${safeV}`, dataX + kw, dy);
    dy += 5;
  }

  // Diagnóstico principal (linha completa, abaixo da foto se necessário)
  dy += 2;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(F_LABEL_SIZE);
  sc(doc, BRAND);
  doc.text('Diagnóstico Principal:', dataX, dy);
  dy += 4.5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(F_BODY_SIZE);
  sc(doc, DARK);
  const diagLines: string[] = doc.splitTextToSize(diagStr, dataW);
  doc.text(diagLines[0] || diagStr, dataX, dy);
  dy += F_LINE_H;

  return Math.max(dy + 6, y + photoD + 10);
}

function _drawAvatarCover(doc: any, name: string, cx: number, cy: number, r: number): void {
  sf(doc, BRAND); sdd(doc, BRAND);
  doc.circle(cx, cy, r, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(r * 1.2);
  sc(doc, WHITE);
  // Baseline = cy + cap_height/2 ≈ cy + 3mm para fonte 24pt em círculo r=20mm
  doc.text(getInitials(name), cx, cy + r * 0.15, { align: 'center' });
}

// ════════════════════════════════════════════════════════════════════════════
// HELPERS PARA RELATÓRIO EVOLUTIVO (mantidos — documento oficial com validação)
// ════════════════════════════════════════════════════════════════════════════

function addDocHeader(
  doc: any, title: string, _subtitle: string, _studentName: string,
  auditCode: string, school?: SchoolConfig | null,
): number {
  const W     = doc.internal.pageSize.getWidth();
  const label = school?.schoolName?.trim() || 'Sistema IncluiAI';

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(DARK[0], DARK[1], DARK[2]);
  doc.text(label, ML, 6.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(GRAY[0], GRAY[1], GRAY[2]);
  if (title) doc.text(title, W / 2, 6.5, { align: 'center' });

  doc.setFont('courier', 'normal');
  doc.setFontSize(7.5);
  doc.text(`Cód. Registro: ${auditCode}`, W - MR, 6.5, { align: 'right' });

  doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2]);
  doc.setLineWidth(0.3);
  doc.line(ML, 9, W - MR, 9);
  return 11;
}

function addDocFooter(doc: any, auditCode: string, emittedBy: string): void {
  const W    = doc.internal.pageSize.getWidth();
  const H    = doc.internal.pageSize.getHeight();
  const fY   = H - BOTTOM_MARGIN - FOOTER_H;
  const cleanBy = (emittedBy || '').replace(/\s*(MASTER|PRO|FREE|PREMIUM|INSTITUTIONAL)\s*/gi, '').trim() || emittedBy;

  doc.setDrawColor(BRAND[0], BRAND[1], BRAND[2]);
  doc.setLineWidth(0.6);
  doc.line(0, fY, W, fY);
  doc.setFillColor(GOLD[0], GOLD[1], GOLD[2]);
  doc.rect(0, fY + 0.7, W, 1.2, 'F');
  doc.setFillColor(248, 249, 250);
  doc.rect(0, fY + 2, W, FOOTER_H - 2, 'F');

  const textRight = W - MR;
  const cx        = ML + (textRight - ML) / 2;
  const dateStr   = new Date().toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(GRAY[0], GRAY[1], GRAY[2]);
  doc.text(`Emitido por: ${cleanBy}  ·  ${dateStr}`, ML, fY + 7.5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6);
  doc.setTextColor(BRAND[0], BRAND[1], BRAND[2]);
  doc.text('DOCUMENTO REGISTRADO', textRight, fY + 7.5, { align: 'right' });

  doc.setFont('courier', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(BRAND[0], BRAND[1], BRAND[2]);
  doc.text(`Código de Registro ${auditCode}`, cx, fY + 14, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(BRAND[0], BRAND[1], BRAND[2]);
  doc.text(`${INCLUIAI_SITE} — Código de Registro ${auditCode}`, ML, fY + 20);
  doc.setTextColor(GRAY[0], GRAY[1], GRAY[2]);
  doc.text(
    `Página ${doc.internal.getCurrentPageInfo().pageNumber} de ${doc.internal.getNumberOfPages()}`,
    cx, fY + 20, { align: 'center' },
  );
}

function addFooterAllPages(doc: any, auditCode: string, emittedBy: string): void {
  const pages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pages; i++) { doc.setPage(i); addDocFooter(doc, auditCode, emittedBy); }
}

function addSectionTitle(doc: any, title: string, x: number, y: number, w: number): number {
  doc.setFillColor(BRAND[0], BRAND[1], BRAND[2]);
  doc.rect(x, y, w, 8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(255, 255, 255);
  doc.text(title.toUpperCase(), x + 4, y + 5.5);
  return y + 11;
}

const BODY_SIZE = 12;
const LABEL_SIZE = 10;
const LINE_H = 6.5;


// ─── Canvas chart generators (inalterados) ────────────────────────────────────
async function generateRadarCanvas(
  scores: number[], criteria: { name: string }[],
): Promise<string> {
  const size = 480;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, size, size);

  const cx = size / 2, cy = size / 2, r = 180;
  const n  = criteria.length;
  const step = (Math.PI * 2) / n;

  ctx.strokeStyle = '#e5e7eb'; ctx.lineWidth = 1;
  [0.2, 0.4, 0.6, 0.8, 1].forEach(scale => {
    ctx.beginPath(); ctx.arc(cx, cy, r * scale, 0, Math.PI * 2); ctx.stroke();
  });
  criteria.forEach((_, i) => {
    const angle = i * step - Math.PI / 2;
    ctx.beginPath(); ctx.moveTo(cx, cy);
    ctx.lineTo(cx + r * Math.cos(angle), cy + r * Math.sin(angle));
    ctx.strokeStyle = '#e5e7eb'; ctx.lineWidth = 1; ctx.stroke();
    const lx = cx + (r + 24) * Math.cos(angle);
    const ly = cy + (r + 24) * Math.sin(angle);
    ctx.font = 'bold 11px Arial'; ctx.fillStyle = '#374151';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(criteria[i].name.split(' ')[0], lx, ly);
  });

  ctx.beginPath();
  scores.forEach((val, i) => {
    const angle = i * step - Math.PI / 2;
    const rv = (val / 5) * r;
    const px = cx + rv * Math.cos(angle);
    const py = cy + rv * Math.sin(angle);
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  });
  ctx.closePath();
  ctx.fillStyle = 'rgba(31, 78, 95, 0.18)'; ctx.fill();
  ctx.strokeStyle = 'rgba(31, 78, 95, 0.85)'; ctx.lineWidth = 2.5; ctx.stroke();

  scores.forEach((val, i) => {
    const angle = i * step - Math.PI / 2;
    const rv = (val / 5) * r;
    ctx.beginPath();
    ctx.arc(cx + rv * Math.cos(angle), cy + rv * Math.sin(angle), 5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgb(31, 78, 95)'; ctx.fill();
  });

  return canvas.toDataURL('image/png');
}

async function generateBarCanvas(
  scores: number[], criteria: { name: string }[],
): Promise<string> {
  const CW = 900, CH = 340;
  const canvas = document.createElement('canvas');
  canvas.width = CW; canvas.height = CH;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#f9fafb'; ctx.fillRect(0, 0, CW, CH);

  const pad  = { l: 40, r: 20, t: 20, b: 60 };
  const chartW = CW - pad.l - pad.r;
  const chartH = CH - pad.t - pad.b;
  const barW   = chartW / scores.length - 8;

  [1, 2, 3, 4, 5].forEach(v => {
    const gy = pad.t + chartH - (v / 5) * chartH;
    ctx.beginPath(); ctx.moveTo(pad.l, gy); ctx.lineTo(CW - pad.r, gy);
    ctx.strokeStyle = '#e5e7eb'; ctx.lineWidth = 1; ctx.stroke();
    ctx.font = '11px Arial'; ctx.fillStyle = '#9ca3af';
    ctx.textAlign = 'right'; ctx.fillText(String(v), pad.l - 4, gy + 4);
  });

  scores.forEach((val, i) => {
    const x    = pad.l + i * (chartW / scores.length) + 4;
    const barH = (val / 5) * chartH;
    const y    = pad.t + chartH - barH;
    const grad = ctx.createLinearGradient(x, y, x, pad.t + chartH);
    grad.addColorStop(0, 'rgba(31, 78, 95, 0.9)');
    grad.addColorStop(1, 'rgba(100, 160, 185, 0.7)');
    ctx.fillStyle = grad;
    (ctx as any).roundRect
      ? (ctx as any).roundRect(x, y, barW, barH, [4, 4, 0, 0])
      : ctx.rect(x, y, barW, barH);
    ctx.fill();
    ctx.font = 'bold 13px Arial'; ctx.fillStyle = '#1f2937';
    ctx.textAlign = 'center'; ctx.fillText(String(val), x + barW / 2, y - 6);
    const label = criteria[i].name.split(' ').slice(0, 2).join(' ');
    ctx.font = '10px Arial'; ctx.fillStyle = '#6b7280';
    ctx.fillText(label, x + barW / 2, pad.t + chartH + 18);
  });

  return canvas.toDataURL('image/png');
}

async function generateLineCanvas(
  evolutions: StudentEvolution[], criteria: { name: string }[],
): Promise<string> {
  if (evolutions.length < 2) return '';
  const CW = 900, CH = 300;
  const canvas = document.createElement('canvas');
  canvas.width = CW; canvas.height = CH;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#f9fafb'; ctx.fillRect(0, 0, CW, CH);

  const pad    = { l: 40, r: 20, t: 20, b: 50 };
  const chartW = CW - pad.l - pad.r;
  const chartH = CH - pad.t - pad.b;
  const sorted = [...evolutions].sort(
    (a, b) => new Date((a as any).date || (a as any).createdAt || '').getTime() -
              new Date((b as any).date || (b as any).createdAt || '').getTime(),
  );
  const colors = ['#1F4E5F', '#2E7D9A', '#4FA8C5', '#7CC4D8', '#C69214'];

  [1, 2, 3, 4, 5].forEach(v => {
    const gy = pad.t + chartH - ((v - 1) / 4) * chartH;
    ctx.beginPath(); ctx.moveTo(pad.l, gy); ctx.lineTo(CW - pad.r, gy);
    ctx.strokeStyle = '#e5e7eb'; ctx.lineWidth = 1; ctx.stroke();
    ctx.font = '11px Arial'; ctx.fillStyle = '#9ca3af';
    ctx.textAlign = 'right'; ctx.fillText(String(v), pad.l - 4, gy + 4);
  });

  sorted.forEach((ev, i) => {
    const x = pad.l + (i / (sorted.length - 1)) * chartW;
    const d = new Date((ev as any).date || (ev as any).createdAt || '');
    const label = isNaN(d.getTime()) ? `#${i + 1}` : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    ctx.font = '9px Arial'; ctx.fillStyle = '#6b7280';
    ctx.textAlign = 'center'; ctx.fillText(label, x, pad.t + chartH + 15);
  });

  criteria.slice(0, 5).forEach((c, ci) => {
    ctx.beginPath(); ctx.strokeStyle = colors[ci]; ctx.lineWidth = 2;
    sorted.forEach((ev, i) => {
      const val = ev.scores?.[ci] ?? 1;
      const x = pad.l + (i / Math.max(1, sorted.length - 1)) * chartW;
      const y = pad.t + chartH - ((val - 1) / 4) * chartH;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
    const lx = pad.l + ci * (chartW / 5);
    ctx.fillStyle = colors[ci]; ctx.fillRect(lx, pad.t + chartH + 28, 12, 8);
    ctx.font = '9px Arial'; ctx.fillStyle = '#374151';
    ctx.textAlign = 'left';
    ctx.fillText(c.name.split(' ')[0], lx + 14, pad.t + chartH + 36);
  });

  return canvas.toDataURL('image/png');
}

// ════════════════════════════════════════════════════════════════════════════
// EXPORT SERVICE
// ════════════════════════════════════════════════════════════════════════════
export const ExportService = {

  // ── Ficha do Aluno — documento INTERNO (sem QR, sem URL pública) ─────────
  async generateStudentProfilePDF(
    student: Student,
    emittedBy = 'Sistema',
    school?: SchoolConfig | null,
    config?: {
      dadosAluno?: boolean; fotoAluno?: boolean; logoEscola?: boolean;
      enderecoCompleto?: boolean; codigoUnico?: boolean;
      perfilPedagogico?: boolean; conhecimentoPrevio?: boolean;
      dadosSociofamiliares?: boolean; responsaveisContatos?: boolean;
      ultimaAvaliacao?: boolean; agendamentos?: boolean;
      controleAtendimento?: boolean;
      documentosGerados?: boolean;
      analiseLaudo?: boolean; fichasComplementares?: boolean;
    },
    extraData?: {
      evolutions?: any[]; appointments?: any[]; serviceRecords?: any[];
      timeline?: any[]; activities?: any[]; documents?: any[];
      medicalReports?: any[]; obsForms?: any[]; fichas?: any[]; protocols?: any[];
    },
  ) {
    const cfg = {
      dadosAluno: true, fotoAluno: true, logoEscola: true,
      enderecoCompleto: false, codigoUnico: true,
      perfilPedagogico: true, conhecimentoPrevio: true,
      dadosSociofamiliares: true, responsaveisContatos: true,
      ultimaAvaliacao: true, agendamentos: true,
      controleAtendimento: true,
      documentosGerados: true,
      analiseLaudo: true, fichasComplementares: true,
      ...config,
    };
    const extra = extraData ?? {};

    const jsPDF = await loadJsPDF();
    const doc   = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const W     = doc.internal.pageSize.getWidth();
    const H     = doc.internal.pageSize.getHeight();
    const maxW  = W - FL - FR;

    const internalCode = makeAuditCode('FICHA', student.id);
    const schoolForDoc = cfg.logoEscola ? school : null;

    // Pre-processa foto circular
    let circularPhoto: string | undefined;
    if (cfg.fotoAluno && student.photoUrl) {
      try { circularPhoto = await cropCircle(student.photoUrl); } catch {}
    }

    // Dados normalizados
    const age         = calcAge(student.birthDate);
    const rawSex      = (student as any).gender || (student as any).sex || '';
    const gLabel      = rawSex === 'M' ? 'Masculino' : rawSex === 'F' ? 'Feminino' : rawSex || 'Não informado';
    const supLvl      = (student as any).supportLevel || (student as any).support_level || '';
    const diagArr     = student.diagnosis || [];
    const cidVal      = typeof student.cid === 'string' ? student.cid
                      : Array.isArray(student.cid) ? (student.cid as string[]).join(', ') : '';
    const status      = (student as any).tipo_aluno === 'com_laudo' ? 'Com Laudo'
                      : (student as any).tipo_aluno === 'em_triagem' ? 'Em Triagem' : 'Em Preenchimento';
    const shift       = student.shift || (student as any).turno || '';
    const medication  = (student as any).medication || '';
    const uniqueCode  = (student as any).unique_code || student.id?.slice(-8) || '';
    const recomendacoes   = (student as any).recomendacoes   || (student as any).recommendations || '';
    const encaminhamentos = (student as any).encaminhamentos || (student as any).referrals || '';
    const adaptacoes  = (student as any).adaptacoes || (student as any).adaptations || [];
    const recursos    = (student as any).recursos    || (student as any).resources    || [];
    const adaptItems  = [...adaptacoes, ...recursos].filter((it: any) => it?.trim?.());
    const interacaoSocial = (student as any).interacaoSocial || (student as any).social_interaction || '';
    const diagStr     = [diagArr[0] || '', cidVal].filter(Boolean).join(' - ') || 'Não informado';
    const schoolName  = schoolForDoc?.schoolName?.trim() || (student as any).schoolName || '';
    const cityLine    = [schoolForDoc?.city, schoolForDoc?.state].filter(Boolean).join(' - ');
    const emitDate    = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
    const pBottom     = pf_pfBottom(H);
    const pfHeader    = (): number => pf_header(doc, student.name, internalCode, schoolForDoc);

    // ==============================================================
    // PAGINA 1 - CAPA HERO + RESUMO + EQUIPE ESCOLAR
    // ==============================================================

    // Cabecalho da pagina 1
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); sc(doc, PF_SL900);
    doc.text((schoolName || 'Escola não informada').toUpperCase(), FL, 7.5);
    if (cityLine) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); sc(doc, PF_SL500);
      doc.text(cityLine, FL, 11.5);
    }
    // Direita: marca IncluiAI + site
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); sc(doc, BRAND as [number,number,number]);
    doc.text('IncluiAI', W - FR, 7.5, { align: 'right' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); sc(doc, PF_SL400);
    doc.text('www.incluiai.app.br', W - FR, 11.5, { align: 'right' });
    sdd(doc, PF_SL200); doc.setLineWidth(0.25); doc.line(FL, 13, W - FR, 13);

    // Hero Card
    let y = 16;
    const heroH = 70;
    sf(doc, WHITE); sdd(doc, PF_SL200); doc.setLineWidth(0.25);
    doc.roundedRect(FL, y, maxW, heroH, 3, 3, 'FD');
    // Barra de acento laranja a direita
    sf(doc, PF_ORANGE_ACC); doc.rect(FL + maxW - 2, y + 3, 2, heroH - 6, 'F');

    // Subtitulo
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); sc(doc, PF_SL400);
    doc.text('DOCUMENTAÇÃO EDUCACIONAL INCLUSIVA', FL + 8, y + 9);

    // Box do codigo (canto superior direito do hero)
    const codeBoxW = 52, codeBoxX = FL + maxW - codeBoxW - 6;
    sf(doc, GBKG); sdd(doc, PF_SL200); doc.setLineWidth(0.2);
    doc.roundedRect(codeBoxX, y + 4, codeBoxW, 14, 2, 2, 'FD');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(6); sc(doc, PF_SL400);
    doc.text('CÓDIGO DO DOCUMENTO', codeBoxX + codeBoxW / 2, y + 9.5, { align: 'center' });
    doc.setFont('courier', 'bold'); doc.setFontSize(5.5); sc(doc, PF_SL900);
    doc.text(internalCode.substring(0, 26), codeBoxX + codeBoxW / 2, y + 14.5, { align: 'center' });

    // Titulo do documento
    doc.setFont('helvetica', 'bold'); doc.setFontSize(18); sc(doc, PF_SL900);
    doc.text('FICHA DO ALUNO', FL + 8, y + 22);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); sc(doc, PF_SL500);
    doc.text(`Emissão: ${emitDate}`, FL + 8, y + 28);

    // Divisoria interna do hero
    sf(doc, PF_SL100); doc.rect(FL + 6, y + 32, maxW - 12, 0.4, 'F');

    // Bloco do aluno
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); sc(doc, PF_SL400);
    doc.text('ALUNO', FL + 8, y + 37);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(14); sc(doc, PF_SL900);
    const nameLines = doc.splitTextToSize(student.name, codeBoxX - FL - 14) as string[];
    doc.text(nameLines[0], FL + 8, y + 44);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); sc(doc, PF_SL500);
    doc.text(`Cód. Aluno: ${uniqueCode || '—'}`, FL + 8, y + 50);

    // Foto circular (se disponivel)
    if (circularPhoto) {
      try {
        const photoD = 16;
        doc.addImage(circularPhoto, 'PNG', FL + maxW - photoD - 8, y + 34, photoD, photoD);
      } catch {}
    }

    // 4 boxes de info na base do hero
    const boxRowY = y + 56, boxH2 = 11, boxGap = 3;
    const boxW    = (maxW - boxGap * 3) / 4;
    [
      { label: 'Série / Turma',    value: pf_val(student.grade), orange: false },
      { label: 'Turno',            value: pf_val(shift),          orange: false },
      { label: 'Nível de Suporte', value: pf_val(supLvl),         orange: false },
      { label: 'Status',           value: status,                  orange: status !== 'Em Preenchimento' },
    ].forEach((box, i) => {
      const bx  = FL + i * (boxW + boxGap);
      const bbg = box.orange ? PF_ORANGE_BG  : PF_SL100;
      const btx = box.orange ? PF_ORANGE_TXT : PF_SL700;
      const bbd = box.orange ? PF_ORANGE_BD  : PF_SL200;
      const blb = box.orange ? PF_ORANGE_ACC : PF_SL400;
      sf(doc, bbg); sdd(doc, bbd); doc.setLineWidth(0.2);
      doc.roundedRect(bx, boxRowY, boxW, boxH2, 2, 2, 'FD');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(6); sc(doc, blb);
      doc.text(box.label.toUpperCase(), bx + 4, boxRowY + 4.5);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); sc(doc, btx);
      doc.text(box.value, bx + 4, boxRowY + 9.5);
    });
    y = y + heroH + 6;

    // Secao I: Resumo do Aluno
    y = pf_sectionTitle(doc, 'I', 'Resumo do Aluno', FL, y);
    y = pf_infoGrid(doc, [
      ['Nascimento',            pf_val(student.birthDate)],
      ['Idade',                 age || 'Não calculada'],
      ['Gênero',                gLabel],
      ['Diagnóstico principal', diagStr],
      ['Medicação',             pf_val(medication, 'Não usa medicação')],
      ['Cód. do documento',     internalCode],
    ], FL, y, maxW, 3);
    y += 4;

    // Secao II: Responsavel e Equipe Escolar
    if (y > pBottom - 48) { doc.addPage(); y = pfHeader(); }
    y = pf_sectionTitle(doc, 'II', 'Responsável e Equipe Escolar', FL, y);
    const rCardW = (maxW - 4) / 2, rCardH = 26;

    sf(doc, WHITE); sdd(doc, PF_SL200); doc.setLineWidth(0.25);
    doc.roundedRect(FL, y, rCardW, rCardH, 2, 2, 'FD');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); sc(doc, PF_SL400);
    doc.text('RESPONSÁVEL LEGAL', FL + 4, y + 6);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); sc(doc, PF_SL900);
    doc.text(pf_val(student.guardianName), FL + 4, y + 13);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); sc(doc, PF_SL500);
    doc.text([student.guardianPhone?.trim(), student.guardianEmail?.trim()].filter(Boolean).join(' · ') || 'Não informado', FL + 4, y + 19);

    const rcx = FL + rCardW + 4;
    sf(doc, WHITE); sdd(doc, PF_SL200); doc.setLineWidth(0.25);
    doc.roundedRect(rcx, y, rCardW, rCardH, 2, 2, 'FD');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); sc(doc, PF_SL400);
    doc.text('EQUIPE ESCOLAR', rcx + 4, y + 6);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); sc(doc, PF_SL700);
    doc.text(`Regente: ${pf_val(student.regentTeacher)}`, rcx + 4, y + 12);
    doc.text(`AEE: ${pf_val(student.aeeTeacher, 'Não atribuído')}`, rcx + 4, y + 17);
    doc.text(`Coordenação: ${pf_val(student.coordinator)}`, rcx + 4, y + 22);
    y += rCardH + 4;

    const profs = (student.professionals || []).filter((p: any) => p?.trim?.());
    if (profs.length > 0) { y = pf_chipList(doc, profs, FL, y, maxW, 'blue'); y += 2; }

    // ==============================================================
    // PAGINA 2 - MAPA PEDAGOGICO + CONTEXTO + OBSERVACOES
    // ==============================================================
    doc.addPage(); y = pfHeader();

    // Secao III: Mapa Pedagogico e Funcional
    if (cfg.perfilPedagogico) {
      y = pf_sectionTitle(doc, 'III', 'Mapa Pedagógico e Funcional', FL, y);
      y = pf_twoChipCards(doc,
        { title: 'Habilidades / Potencialidades', chips: student.abilities    || [], tone: 'green'  },
        { title: 'Dificuldades / Barreiras',      chips: student.difficulties || [], tone: 'orange' },
        FL, y, maxW,
      );
      const commStr  = (student.communication || []).filter((c: any) => c?.trim?.()).join(', ') || 'Em preenchimento';
      const stratStr = (student.strategies    || []).filter((s: any) => s?.trim?.()).join(', ') || 'Em preenchimento';
      y = pf_infoGrid(doc, [
        ['Formas de Comunicação',            commStr],
        ['Estratégias Pedagógicas Eficazes', stratStr],
        ['Adaptações e Recursos Necessários', adaptItems.length ? adaptItems.join(', ') : 'Em preenchimento'],
      ], FL, y, maxW, 3);
      y += 2;
      if (interacaoSocial?.trim()) {
        if (y > pBottom - 22) { doc.addPage(); y = pfHeader(); }
        y = pf_infoGrid(doc, [['Interação Social', interacaoSocial]], FL, y, maxW, 1);
        y += 2;
      }
    }

    // Secao IV: Contexto Escolar e Familiar
    if (y > pBottom - 55) { doc.addPage(); y = pfHeader(); }
    y = pf_sectionTitle(doc, 'IV', 'Contexto Escolar e Familiar', FL, y);
    y = pf_twoTextCards(doc,
      { title: 'Histórico Escolar', text: student.schoolHistory || '' },
      { title: 'Contexto Familiar', text: student.familyContext  || '' },
      FL, y, maxW,
    );
    if (diagArr.length > 0) {
      if (y > pBottom - 18) { doc.addPage(); y = pfHeader(); }
      sf(doc, WHITE); sdd(doc, PF_SL200); doc.setLineWidth(0.25);
      doc.roundedRect(FL, y, maxW, 18, 2, 2, 'FD');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); sc(doc, PF_SL900);
      doc.text('Diagnósticos Registrados', FL + 4, y + 8);
      pf_chipList(doc, diagArr, FL + 4, y + 11, maxW - 8, 'blue');
      y += 21;
    }

    // Secao V: Observacoes e Recomendacoes
    if (y > pBottom - 38) { doc.addPage(); y = pfHeader(); }
    y = pf_sectionTitle(doc, 'V', 'Observações e Recomendações', FL, y);
    y = pf_twoTextCards(doc,
      { title: 'Observações Pedagógicas',   text: pf_val(student.observations, 'Não informado') },
      { title: 'Recomendações Pedagógicas', text: pf_val(recomendacoes,         'Não informado') },
      FL, y, maxW,
    );
    if (encaminhamentos?.trim()) {
      if (y > pBottom - 22) { doc.addPage(); y = pfHeader(); }
      y = pf_infoGrid(doc, [['Encaminhamentos', encaminhamentos]], FL, y, maxW, 1);
      y += 2;
    }

    // ==============================================================
    // SECAO CONHECIMENTO PREVIO
    // ==============================================================
    if (cfg.conhecimentoPrevio && student.priorKnowledge) {
      const pk = student.priorKnowledge;
      const PKL: Record<1|2|3|4|5, string> = {
        1: 'Muito inicial', 2: 'Inicial', 3: 'Em desenvolvimento',
        4: 'Adequado para a etapa', 5: 'Avançado para a etapa',
      };
      const pkAreas: [string, number | undefined, string | undefined][] = [
        ['Leitura',           pk.leitura_score,      pk.leitura_notes],
        ['Escrita',           pk.escrita_score,       pk.escrita_notes],
        ['Compreensão',       pk.entendimento_score,  pk.entendimento_notes],
        ['Autonomia',         pk.autonomia_score,     pk.autonomia_notes],
        ['Atenção',           pk.atencao_score,       pk.atencao_notes],
        ['Raciocínio Lógico', pk.raciocinio_score,    pk.raciocinio_notes],
      ].filter(([, score]) => score !== undefined) as [string, number, string | undefined][];
      const hasAnyPk = pkAreas.length > 0 || pk.observacoes_pedagogicas;

      if (hasAnyPk) {
        if (y > pBottom - 55) { doc.addPage(); y = pfHeader(); }
        y = pf_sectionTitle(doc, 'CP', 'Conhecimento Prévio', FL, y);

        if (pkAreas.length > 0) {
          const colW = (maxW - 4) / 2, rowH = 14, gap = 4;
          for (let i = 0; i < pkAreas.length; i += 2) {
            const left  = pkAreas[i];
            const right = pkAreas[i + 1];
            if (y > pBottom - rowH - 4) { doc.addPage(); y = pfHeader(); }
            [left, right].forEach((area, col) => {
              if (!area) return;
              const [label, score, notes] = area;
              const bx = FL + col * (colW + gap);
              sf(doc, WHITE); sdd(doc, PF_SL200); doc.setLineWidth(0.2);
              doc.roundedRect(bx, y, colW, rowH, 2, 2, 'FD');
              const scoreNum = score as 1|2|3|4|5;
              const scoreLabel = PKL[scoreNum] ?? '—';
              const pct = Math.round(((score as number) / 5) * 100);
              // Barra de progresso
              const barX = bx + 4, barY = y + rowH - 3.5, barW = colW - 8, barH = 1.5;
              sf(doc, PF_SL100); doc.rect(barX, barY, barW, barH, 'F');
              const fillColor: [number,number,number] = score <= 2 ? [239,68,68] : score === 3 ? [245,158,11] : [34,197,94];
              sf(doc, fillColor); doc.rect(barX, barY, barW * pct / 100, barH, 'F');
              doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); sc(doc, PF_SL400);
              doc.text(label.toUpperCase(), bx + 4, y + 5);
              doc.setFont('helvetica', 'bold'); doc.setFontSize(8); sc(doc, PF_SL900);
              doc.text(`${score}/5`, bx + 4, y + 10);
              doc.setFont('helvetica', 'normal'); doc.setFontSize(7); sc(doc, PF_SL500);
              doc.text(scoreLabel, bx + 14, y + 10);
              if (notes?.trim()) {
                const noteText = doc.splitTextToSize(notes.trim(), colW - 8)[0] as string;
                doc.setFont('helvetica', 'normal'); doc.setFontSize(6); sc(doc, PF_SL400);
                doc.text(noteText, bx + 4, y + rowH - 5);
              }
            });
            y += rowH + 2;
          }
        }

        if (pk.observacoes_pedagogicas?.trim()) {
          if (y > pBottom - 22) { doc.addPage(); y = pfHeader(); }
          y = pf_infoGrid(doc, [['Observações Pedagógicas (CP)', pk.observacoes_pedagogicas]], FL, y, maxW, 1);
          y += 2;
        }
      }
    }

    // ==============================================================
    // SECAO DADOS SOCIOFAMILIARES
    // ==============================================================
    if (cfg.dadosSociofamiliares && student.sociofamilyData) {
      const socioData = student.sociofamilyData;
      const fs  = socioData.familyStatus;
      const ben = socioData.benefits;
      const tri = (t?: string) => t === 'yes' ? 'Sim' : t === 'no' ? 'Não' : 'Não informado';

      const sfRows: [string, string][] = [
        ['Com quem mora',         fs?.studentLivesWith        || ''],
        ['Responsável principal', fs?.mainGuardianName         || ''],
        ['Tel. escolar',          fs?.schoolPrimaryPhone       || ''],
        ['Contato emergência',    fs?.emergencyContactName     || ''],
        ['Tel. emergência',       fs?.emergencyContactPhone    || ''],
        ['Bolsa Família',         tri(ben?.bolsaFamilia)],
        ['BPC/LOAS',              tri(ben?.bpcLoas)],
      ].filter(([, v]) => v && v !== 'Não informado') as [string, string][];

      const sfNotes = [fs?.notes, ben?.notes, ben?.otherBenefit].filter(Boolean).join(' · ');
      const hasSfData = sfRows.length > 0 || sfNotes;

      if (hasSfData) {
        if (y > pBottom - 45) { doc.addPage(); y = pfHeader(); }
        y = pf_sectionTitle(doc, 'SF', 'Dados Sociofamiliares', FL, y);
        if (sfRows.length > 0) {
          y = pf_infoGrid(doc, sfRows, FL, y, maxW, Math.min(sfRows.length, 4));
          y += 2;
        }
        if (sfNotes) {
          if (y > pBottom - 18) { doc.addPage(); y = pfHeader(); }
          y = pf_infoGrid(doc, [['Observações', sfNotes]], FL, y, maxW, 1);
          y += 2;
        }
      }
    }

    // ==============================================================
    // SECAO RESPONSAVEIS E CONTATOS (expandido)
    // ==============================================================
    if (cfg.responsaveisContatos && student.sociofamilyData) {
      const { guardian1, guardian2 } = student.sociofamilyData;
      const guardians = [
        { label: 'Responsável / Guardião 1', g: guardian1 },
        { label: 'Responsável / Guardião 2', g: guardian2 },
      ].filter(({ g }) => g?.fullName?.trim());

      const emName  = student.emergencyContactName  || student.sociofamilyData.familyStatus?.emergencyContactName  || (student as any).emergencyContactName  || '';
      const emPhone = student.emergencyContactPhone || student.sociofamilyData.familyStatus?.emergencyContactPhone || (student as any).emergencyContactPhone || '';

      const hasExpanded = guardians.length > 0 || emName;
      if (hasExpanded) {
        if (y > pBottom - 50) { doc.addPage(); y = pfHeader(); }
        y = pf_sectionTitle(doc, 'RC', 'Responsáveis e Contatos', FL, y);

        for (const { label, g } of guardians) {
          if (y > pBottom - 36) { doc.addPage(); y = pfHeader(); }
          const cardH = 34;
          sf(doc, WHITE); sdd(doc, PF_SL200); doc.setLineWidth(0.25);
          doc.roundedRect(FL, y, maxW, cardH, 2, 2, 'FD');
          doc.setFont('helvetica', 'bold'); doc.setFontSize(7); sc(doc, PF_SL400);
          doc.text(label.toUpperCase(), FL + 4, y + 6);
          doc.setFont('helvetica', 'bold'); doc.setFontSize(9); sc(doc, PF_SL900);
          doc.text(g.fullName, FL + 4, y + 13);
          doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); sc(doc, PF_SL700);
          const row2Parts = [g.relationship && `Vínculo: ${g.relationship}`, g.phone && `Tel.: ${g.phone}`].filter(Boolean).join('   ');
          doc.text(row2Parts || '—', FL + 4, y + 19);
          if (g.address?.street?.trim()) {
            const addrParts = [g.address.street, g.address.number, g.address.complement, g.address.district, g.address.city, g.address.state].filter(Boolean).join(', ');
            doc.setFont('helvetica', 'normal'); doc.setFontSize(7); sc(doc, PF_SL500);
            const addrLine = doc.splitTextToSize(addrParts, maxW - 8)[0] as string;
            doc.text(addrLine, FL + 4, y + 25);
          }
          if (g.isEmergencyContact) {
            doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); sc(doc, [239,68,68] as [number,number,number]);
            doc.text('Contato de emergência', FL + 4, y + 31);
          }
          y += cardH + 3;
        }

        if (emName && !guardians.some(({ g }) => g.isEmergencyContact)) {
          if (y > pBottom - 18) { doc.addPage(); y = pfHeader(); }
          const emParts: [string, string][] = [['Contato de emergência', emName]];
          if (emPhone) emParts.push(['Telefone emergência', emPhone]);
          y = pf_infoGrid(doc, emParts, FL, y, maxW, 2);
          y += 2;
        }
      }
    }

    // ==============================================================
    // PAGINA 3+ - REGISTROS COMPLEMENTARES (somente se houver dados)
    // ==============================================================
    const hasSupplementary =
      (cfg.ultimaAvaliacao      && extra.evolutions    && extra.evolutions.length    > 0) ||
      (cfg.agendamentos         && extra.appointments  && extra.appointments.length  > 0) ||
      (cfg.controleAtendimento  && extra.serviceRecords && extra.serviceRecords.length > 0) ||
      (cfg.documentosGerados    && extra.protocols     && extra.protocols.length     > 0) ||
      (cfg.analiseLaudo         && extra.documents     && extra.documents.some((d: any) => d.type === 'Laudo' || d.type === 'Relatorio')) ||
      (cfg.fichasComplementares && extra.obsForms      && extra.obsForms.length      > 0);

    if (hasSupplementary) {
      doc.addPage(); y = pfHeader();
      const CRITERIA_NAMES = [
        'Comunicação Expressiva', 'Interação Social', 'Autonomia (AVD)', 'Autorregulação',
        'Atenção Sustentada', 'Compreensão', 'Motricidade Fina', 'Motricidade Grossa',
        'Participação', 'Linguagem / Leitura',
      ];

      // Secao VI: Avaliacao Cognitiva e Funcional
      if (cfg.ultimaAvaliacao && extra.evolutions && extra.evolutions.length > 0) {
        const ev      = extra.evolutions[0];
        const scores: number[] = ev.scores || [];
        const avg      = scores.length > 0 ? scores.reduce((a: number, b: number) => a + b, 0) / scores.length : 0;
        const avgRound = Math.round(avg * 10) / 10;
        const avgPct   = Math.round((avg / 5) * 100);
        const strong   = CRITERIA_NAMES.filter((_, i) => (scores[i] ?? 0) >= 4);
        const priority = CRITERIA_NAMES.filter((_, i) => (scores[i] ?? 0) <= 2);
        const evDate2  = ev.date ? new Date(ev.date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }) : '—';

        if (y > pBottom - 58) { doc.addPage(); y = pfHeader(); }
        y = pf_sectionTitle(doc, 'VI', 'Avaliação Cognitiva e Funcional', FL, y);

        // 3 cards topo
        const topCardH = 42, topCardW = (maxW - 4) / 3;
        // Card azul: Media Geral
        sf(doc, PF_BLUE_TXT as [number,number,number]);
        doc.roundedRect(FL, y, topCardW, topCardH, 2, 2, 'F');
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7); sc(doc, [179, 210, 255] as [number,number,number]);
        doc.text('MÉDIA GERAL', FL + 4, y + 7);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(20); sc(doc, WHITE);
        doc.text(`${avgRound}/5`, FL + 4, y + 20);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8); sc(doc, [179, 210, 255] as [number,number,number]);
        doc.text(`${avgPct}% de desempenho`, FL + 4, y + 28);
        sf(doc, [60, 100, 180] as [number,number,number]); doc.roundedRect(FL + 4, y + 33, topCardW - 8, 2.5, 1, 1, 'F');
        if (avgPct > 0) { sf(doc, WHITE); doc.roundedRect(FL + 4, y + 33, (topCardW - 8) * avgPct / 100, 2.5, 1, 1, 'F'); }

        // Card verde: Areas Fortes
        const mc1X = FL + topCardW + 2;
        sf(doc, WHITE); sdd(doc, PF_SL200); doc.setLineWidth(0.25);
        doc.roundedRect(mc1X, y, topCardW, topCardH, 2, 2, 'FD');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9); sc(doc, PF_GREEN_TXT);
        doc.text('Áreas Fortes', mc1X + 4, y + 8);
        pf_chipList(doc, strong.slice(0, 4), mc1X + 4, y + 13, topCardW - 8, 'green');

        // Card laranja: Areas Prioritarias
        const mc2X = FL + 2 * topCardW + 4, mc2W = maxW - 2 * topCardW - 4;
        sf(doc, WHITE); sdd(doc, PF_SL200); doc.setLineWidth(0.25);
        doc.roundedRect(mc2X, y, mc2W, topCardH, 2, 2, 'FD');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9); sc(doc, PF_ORANGE_TXT);
        doc.text('Áreas Prioritárias', mc2X + 4, y + 8);
        pf_chipList(doc, priority.slice(0, 4), mc2X + 4, y + 13, mc2W - 8, 'orange');
        y += topCardH + 4;

        doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); sc(doc, PF_SL500);
        doc.text(`Data: ${evDate2}  ·  Profissional: ${ev.author || '—'}`, FL, y);
        y += 6;

        // Barras de dimensao (2 colunas)
        const halfW2 = (maxW - 6) / 2, barLineH = 8;
        const barsCardH = Math.ceil(CRITERIA_NAMES.length / 2) * barLineH + 14;
        if (y > pBottom - barsCardH - 10) { doc.addPage(); y = pfHeader(); }
        sf(doc, WHITE); sdd(doc, PF_SL200); doc.setLineWidth(0.25);
        doc.roundedRect(FL, y, maxW, barsCardH, 2, 2, 'FD');
        CRITERIA_NAMES.forEach((name, i) => {
          const score   = scores[i] ?? 0;
          const cx      = FL + 4 + (i % 2) * (halfW2 + 6);
          const cy      = y + 6 + Math.floor(i / 2) * barLineH;
          const barW    = halfW2 - 22;
          const sColor: [number,number,number] = score >= 4 ? PF_GREEN_TXT : score >= 3 ? BRAND as [number,number,number] : score >= 2 ? [217, 119, 6] : [220, 38, 38];
          doc.setFont('helvetica', 'normal'); doc.setFontSize(8); sc(doc, PF_SL700);
          doc.text((doc.splitTextToSize(name, halfW2 - 24) as string[])[0] || name, cx, cy + 4.5);
          doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); sc(doc, sColor);
          doc.text(`${score}/5`, cx + halfW2 - 14, cy + 4.5);
          pf_progressBar(doc, (score / 5) * 100, cx, cy + 5.5, barW, sColor);
        });
        y += barsCardH + 5;

        // Parecer Descritivo
        if (ev.observation?.trim()) {
          if (y > pBottom - 28) { doc.addPage(); y = pfHeader(); }
          y = pf_sectionTitle(doc, 'VII', 'Parecer Descritivo', FL, y);
          doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
          let remaining = [...(doc.splitTextToSize(ev.observation.trim(), maxW - 12) as string[])];
          while (remaining.length > 0) {
            const chunk  = remaining.splice(0, Math.max(1, Math.floor((pBottom - y - 12) / 4.5)));
            const chunkH = chunk.length * 4.5 + 12;
            sf(doc, WHITE); sdd(doc, PF_SL200); doc.setLineWidth(0.25);
            doc.roundedRect(FL, y, maxW, chunkH, 2, 2, 'FD');
            sc(doc, PF_SL700); doc.text(chunk, FL + 6, y + 8);
            y += chunkH + 4;
            if (remaining.length > 0) { doc.addPage(); y = pfHeader(); }
          }
        }
      }

      // Secao VIII: Agendamentos
      if (cfg.agendamentos && extra.appointments && extra.appointments.length > 0) {
        if (y > pBottom - 42) { doc.addPage(); y = pfHeader(); }
        y = pf_sectionTitle(doc, 'VIII', 'Agendamentos', FL, y);
        const aCols = [22, 16, 48, 26, 36, 0];
        aCols[5] = maxW - aCols.slice(0, 5).reduce((s, v) => s + v, 0);
        sf(doc, PF_SL100); doc.rect(FL, y, maxW, 7, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); sc(doc, BRAND as [number,number,number]);
        let cx2 = FL + 2;
        ['DATA', 'HORA', 'TÍTULO', 'TIPO', 'PROFISSIONAL', 'STATUS'].forEach((h, i) => { doc.text(h, cx2, y + 5); cx2 += aCols[i]; });
        y += 8;
        for (const a of extra.appointments) {
          if (y > pBottom - 10) { doc.addPage(); y = pfHeader(); }
          const ds   = a.date ? new Date(a.date + 'T00:00:00').toLocaleDateString('pt-BR') : '—';
          const stC: Record<string, [number,number,number]> = { realizado: PF_GREEN_TXT, cancelado: [220, 38, 38], falta: [217, 119, 6] };
          doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); sc(doc, PF_SL700);
          cx2 = FL + 2;
          [ds, a.time || '—', (a.title || '').substring(0, 26), (a.type || '—').substring(0, 14), (a.professional || '—').substring(0, 18)].forEach((val, i) => {
            doc.text(val, cx2, y + 4); cx2 += aCols[i];
          });
          doc.setFont('helvetica', 'bold'); sc(doc, stC[a.status] || (BRAND as [number,number,number]));
          doc.text((a.status || 'agendado').toUpperCase(), cx2, y + 4);
          sdd(doc, PF_SL200); doc.setLineWidth(0.2); doc.line(FL, y + 6.5, FL + maxW, y + 6.5);
          y += 7.5;
        }
        y += 4;
      }

      // Secao IX: Controle de Atendimento
      if (cfg.controleAtendimento && extra.serviceRecords && extra.serviceRecords.length > 0) {
        if (y > pBottom - 42) { doc.addPage(); y = pfHeader(); }
        y = pf_sectionTitle(doc, 'IX', 'Controle de Atendimento', FL, y);
        const total    = extra.serviceRecords.length;
        const presente = extra.serviceRecords.filter((r: any) => r.attendance === 'Presente').length;
        const taxa     = total > 0 ? Math.round((presente / total) * 100) : 0;
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8); sc(doc, PF_SL500);
        doc.text(`${total} atendimento(s)  ·  Presença: ${taxa}%`, FL, y);
        pf_progressBar(doc, taxa, FL + 80, y - 3.5, 60, PF_GREEN_TXT);
        y += 8;
        const sCols = [24, 16, 30, 36, 22, 0];
        sCols[5] = maxW - sCols.slice(0, 5).reduce((s, v) => s + v, 0);
        sf(doc, PF_SL100); doc.rect(FL, y, maxW, 7, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); sc(doc, BRAND as [number,number,number]);
        let sx = FL + 2;
        ['DATA', 'HORA', 'TIPO', 'PROFISSIONAL', 'PRESENÇA', 'OBSERVAÇÕES'].forEach((h, i) => { doc.text(h, sx, y + 5); sx += sCols[i]; });
        y += 8;
        for (const r of extra.serviceRecords.slice(0, 30)) {
          if (y > pBottom - 10) { doc.addPage(); y = pfHeader(); }
          const ds = r.date ? new Date(r.date).toLocaleDateString('pt-BR') : '—';
          const pColor: [number,number,number] = r.attendance === 'Presente' ? PF_GREEN_TXT : r.attendance === 'Falta' ? [220, 38, 38] : PF_SL500;
          doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); sc(doc, PF_SL700);
          sx = FL + 2;
          [ds, r.time || '—', (r.type || '—').substring(0, 16), (r.professional || '—').substring(0, 20)].forEach((val, i) => { doc.text(val, sx, y + 4); sx += sCols[i]; });
          doc.setFont('helvetica', 'bold'); sc(doc, pColor);
          doc.text(r.attendance || '—', sx, y + 4); sx += sCols[4];
          doc.setFont('helvetica', 'normal'); sc(doc, PF_SL400);
          doc.text((r.observations || '').substring(0, 28), sx, y + 4);
          sdd(doc, PF_SL200); doc.setLineWidth(0.2); doc.line(FL, y + 6.5, FL + maxW, y + 6.5);
          y += 7.5;
        }
        if (extra.serviceRecords.length > 30) {
          doc.setFont('helvetica', 'italic'); doc.setFontSize(7.5); sc(doc, PF_SL400);
          doc.text(`e mais ${extra.serviceRecords.length - 30} registros`, FL, y + 3);
          y += 6;
        }
        y += 4;
      }

      // Secao X: Documentos, Laudos e Fichas
      const hasDocs =
        (cfg.documentosGerados    && extra.protocols && extra.protocols.length > 0) ||
        (cfg.analiseLaudo         && extra.documents && extra.documents.some((d: any) => d.type === 'Laudo' || d.type === 'Relatorio')) ||
        (cfg.fichasComplementares && extra.obsForms  && extra.obsForms.length  > 0);
      if (hasDocs) {
        if (y > pBottom - 44) { doc.addPage(); y = pfHeader(); }
        y = pf_sectionTitle(doc, 'X', 'Documentos, Laudos e Fichas Complementares', FL, y);
        const docCardW = (maxW - 6) / 3;
        const docItems = (extra.protocols || []).slice(0, 6);
        const laudos   = (extra.documents || []).filter((d: any) => d.type === 'Laudo' || d.type === 'Relatorio').slice(0, 6);
        const fichas   = (extra.obsForms  || []).slice(0, 6);
        const cardH3   = Math.max(40, 14 + Math.max(docItems.length, laudos.length, fichas.length) * 10 + 4);
        const renderListCard = (cx: number, title: string, items: any[], labelFn: (item: any) => string, dateFn: (item: any) => string) => {
          sf(doc, WHITE); sdd(doc, PF_SL200); doc.setLineWidth(0.25);
          doc.roundedRect(cx, y, docCardW, cardH3, 2, 2, 'FD');
          doc.setFont('helvetica', 'bold'); doc.setFontSize(9); sc(doc, PF_SL900);
          doc.text(title, cx + 4, y + 8);
          if (!items.length) {
            doc.setFont('helvetica', 'italic'); doc.setFontSize(8); sc(doc, PF_SL400);
            doc.text('Nenhum registro', cx + 4, y + 16);
          } else {
            items.forEach((item, idx) => {
              const iy = y + 14 + idx * 10;
              doc.setFont('helvetica', 'bold'); doc.setFontSize(8); sc(doc, PF_SL700);
              doc.text((doc.splitTextToSize(labelFn(item), docCardW - 8) as string[])[0], cx + 4, iy);
              doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); sc(doc, PF_SL400);
              doc.text(dateFn(item), cx + 4, iy + 5);
            });
          }
        };
        renderListCard(FL,                    'Documentos Gerados',  docItems,
          (p: any) => p.title || p.doc_type || 'Documento',
          (p: any) => `${p.createdAt ? new Date(p.createdAt).toLocaleDateString('pt-BR') : '—'} · ${p.status === 'FINAL' ? 'Concluído' : 'Rascunho'}`);
        renderListCard(FL + docCardW + 3,     'Laudos e Documentos', laudos,
          (d: any) => d.name || 'Documento clínico',
          (d: any) => `${d.date || '—'} · Tipo: ${d.type}`);
        renderListCard(FL + 2*(docCardW + 3), 'Fichas Complementares', fichas,
          (f: any) => f.title || f.ficha_type || 'Ficha de Observação',
          (f: any) => f.created_at ? new Date(f.created_at).toLocaleDateString('pt-BR') : '—');
        y += cardH3 + 5;
      }
    }

    // ==============================================================
    // ASSINATURAS E VALIDACAO INSTITUCIONAL (sempre ao final)
    // ==============================================================
    if (y > pBottom - 52) { doc.addPage(); y = pfHeader(); }
    y += 4;
    y = pf_sectionTitle(doc, 'XI', 'Assinaturas e Validação Institucional', FL, y);
    doc.setFont('helvetica', 'italic'); doc.setFontSize(9); sc(doc, PF_SL500);
    const decl = 'Declaramos ciência e concordância com as informações pedagógicas registradas nesta ficha, comprometendo-nos a utilizá-las exclusivamente para fins educacionais e de suporte ao aluno.';
    const declLines = doc.splitTextToSize(decl, maxW) as string[];
    doc.text(declLines, FL, y);
    y += declLines.length * 4.5 + 14;

    ['Professor(a) Regente', 'Professor(a) AEE', 'Coordenação Pedagógica', 'Responsável Legal'].forEach((sig, i) => {
      const sx = FL + i * (maxW / 4);
      sdd(doc, PF_SL400); doc.setLineWidth(0.3);
      doc.line(sx, y + 12, sx + maxW / 4 - 4, y + 12);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); sc(doc, PF_SL500);
      doc.text(sig, sx + (maxW / 4 - 4) / 2, y + 17, { align: 'center' });
    });
    y += 26;

    sf(doc, PF_SL100); sdd(doc, PF_SL200); doc.setLineWidth(0.2);
    doc.roundedRect(FL, y, maxW, 14, 2, 2, 'FD');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); sc(doc, PF_SL500);
    doc.text(`Código do documento: ${internalCode}  ·  Emitido em: ${new Date().toLocaleDateString('pt-BR')}`, FL + 4, y + 5);
    doc.setFontSize(7);
    doc.text('Documento pedagógico para uso interno. Não contém link de validação pública.', FL + 4, y + 10);

    // Rodape em todas as paginas
    pf_footerAllPages(doc, internalCode, emittedBy);
    doc.save(`Ficha_${student.name.replace(/\s+/g, '_')}.pdf`);
  },

  // ── Relatório Evolutivo — documento OFICIAL com validação pública ────────
  async exportEvolutionReportPDF(params: {
    student: Student;
    scores: number[];
    observation: string;
    criteria: { name: string; desc: string }[];
    customFields?: DocField[];
    auditCode?: string;
    createdBy?: string;
    createdAt?: string;
    allEvolutions?: StudentEvolution[];
    school?: SchoolConfig | null;
  }) {
    const {
      student, scores, observation, criteria,
      customFields = [], auditCode: existingCode,
      createdBy = 'Sistema', createdAt, allEvolutions = [], school,
    } = params;

    const jsPDF = await loadJsPDF();
    const doc   = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const W     = doc.internal.pageSize.getWidth();
    const H     = doc.internal.pageSize.getHeight();
    const maxW  = W - ML - MR;
    const auditCode = ensureDocumentCode('registration', existingCode);

    const pageHeader = (subtitle = 'Acompanhamento de Desenvolvimento') =>
      addDocHeader(doc, 'RELATÓRIO EVOLUTIVO', subtitle, student.name, auditCode, school);

    const contentTop = pageHeader();
    let y = contentTop;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(BODY_SIZE);
    doc.setTextColor(GRAY[0], GRAY[1], GRAY[2]);
    const _rawDate = createdAt ? new Date(createdAt) : new Date();
    const emitDate = (!isNaN(_rawDate.getTime()) ? _rawDate : new Date())
      .toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
    doc.text(`Emissão: ${emitDate}  |  Profissional: ${createdBy}`, ML, y);
    y += LINE_H + 4;

    try {
      const radarB64 = await generateRadarCanvas(scores, criteria);
      const imgSize  = 74;
      doc.addImage(radarB64, 'PNG', ML, y, imgSize, imgSize);

      const legendX   = ML + imgSize + 6;
      const legendMaxW = W - MR - legendX - 2;
      const barW      = 32;
      const scoreX    = legendX + barW + 2;
      let ly = y + 4;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(BODY_SIZE);
      doc.setTextColor(DARK[0], DARK[1], DARK[2]);
      doc.text('Mapa de Evolução (Radar)', legendX, ly);
      ly += 8;

      criteria.forEach((c, i) => {
        const score     = scores[i] ?? 0;
        const pct       = Math.round((score / 5) * 100);
        const nameLines = doc.splitTextToSize(c.name, legendMaxW);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(DARK[0], DARK[1], DARK[2]);
        doc.text(nameLines[0] || c.name, legendX, ly);
        ly += 4.5;

        doc.setFillColor(236, 244, 247);
        doc.rect(legendX, ly - 3, barW, 4, 'F');
        const scoreColor = score >= 4 ? [22, 163, 74] : score >= 3 ? [124, 58, 237] : score >= 2 ? [217, 119, 6] : [220, 38, 38];
        doc.setFillColor(scoreColor[0], scoreColor[1], scoreColor[2]);
        doc.rect(legendX, ly - 3, barW * (score / 5), 4, 'F');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(scoreColor[0], scoreColor[1], scoreColor[2]);
        doc.text(`${score}/5  ${pct}%`, scoreX, ly);
        ly += 5;
      });

      y = Math.max(y + imgSize + 8, ly + 4);
    } catch {
      criteria.forEach((c, i) => {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(BODY_SIZE);
        doc.setTextColor(DARK[0], DARK[1], DARK[2]);
        doc.text(`${c.name}: ${scores[i]}/5`, ML, y);
        y += LINE_H;
      });
      y += 4;
    }

    let parecerStartY = contentTop;
    let parecerOnNewPage = false;

    try {
      const barB64 = await generateBarCanvas(scores, criteria);
      doc.addPage();
      const y2Start = addDocHeader(doc, 'RELATÓRIO EVOLUTIVO', 'Gráfico de Desempenho', student.name, auditCode, school);
      let y2 = y2Start;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(BODY_SIZE);
      doc.setTextColor(DARK[0], DARK[1], DARK[2]);
      doc.text('Desempenho por Critério (Barras)', ML, y2);
      y2 += LINE_H;
      doc.addImage(barB64, 'PNG', ML, y2, maxW, 64);
      y2 += 70;

      if (allEvolutions.length > 1) {
        try {
          const lineB64 = await generateLineCanvas(allEvolutions, criteria);
          if (lineB64) {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(BODY_SIZE);
            doc.setTextColor(DARK[0], DARK[1], DARK[2]);
            doc.text('Evolução Histórica (Critérios 1–5)', ML, y2 + 4);
            y2 += LINE_H + 4;
            doc.addImage(lineB64, 'PNG', ML, y2, maxW, 60);
            y2 += 66;
          }
        } catch {}
      }

      parecerStartY   = y2 + 6;
      parecerOnNewPage = parecerStartY > contentBottom(H) - 50;
    } catch {
      parecerStartY   = y + 4;
      parecerOnNewPage = parecerStartY > contentBottom(H) - 50;
    }

    let yP = parecerStartY;
    if (parecerOnNewPage) {
      doc.addPage();
      addDocHeader(doc, 'RELATÓRIO EVOLUTIVO', 'Parecer Descritivo', student.name, auditCode);
      yP = CONTENT_TOP;
    }

    yP = addSectionTitle(doc, 'PARECER DESCRITIVO', ML, yP, maxW);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(BODY_SIZE);
    doc.setTextColor(DARK[0], DARK[1], DARK[2]);
    yP = addWrappedText(doc, observation || '—', ML, yP, maxW, LINE_H);
    yP += 6;

    const parecer_header = () => addDocHeader(doc, 'RELATÓRIO EVOLUTIVO', '', student.name, auditCode);

    customFields.forEach(field => {
      if (yP > contentBottom(H) - 30) {
        doc.addPage();
        parecer_header();
        yP = CONTENT_TOP;
      }
      doc.setFillColor(236, 244, 247);
      doc.roundedRect(ML, yP, maxW, 7, 2, 2, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(LABEL_SIZE);
      doc.setTextColor(BRAND[0], BRAND[1], BRAND[2]);
      doc.text(field.label.toUpperCase(), ML + 3, yP + 5);
      yP += 10;

      if (field.type === 'scale') {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(BODY_SIZE);
        doc.setTextColor(DARK[0], DARK[1], DARK[2]);
        doc.text(`Pontuação: ${field.value} / ${field.maxScale || 5}`, ML, yP);
        yP += LINE_H + 2;
      } else {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(BODY_SIZE);
        doc.setTextColor(DARK[0], DARK[1], DARK[2]);
        yP = addWrappedText(doc, String(field.value || '—'), ML, yP, maxW, LINE_H);
        yP += 4;
      }
    });

    addFooterAllPages(doc, auditCode, createdBy);
    doc.save(`Relatorio_Evolutivo_${student.name.replace(/\s+/g, '_')}.pdf`);
  },

  // ── Impressão via window.print (protocolos estruturados) ─────────────────
  async printToPDF(elementId: string, title: string) {
    const el = document.getElementById(elementId);
    if (!el) { window.print(); return; }

    const clone = el.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('[data-no-print]').forEach(n => n.remove());

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:999999;background:white;overflow:auto;';

    const style = document.createElement('style');
    style.textContent = `
      @page { size: A4 portrait; margin: 30mm 20mm 20mm 30mm; }
      html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; background: #fff; }
      * { box-sizing: border-box; }
      body { margin: 0; font-family: Arial, sans-serif; font-size: 12pt; line-height: 1.5; color: #111827; }
      .print-page { width: 160mm; margin: 0 auto; }
      h1 { font-size: 14pt; } h2 { font-size: 13pt; } h3 { font-size: 12pt; }
      h1, h2, h3 { break-after: avoid; } p { margin: 0 0 6pt 0; }
      @media print { body > *:not(#__print_overlay__) { display: none !important; } }
    `;

    const page = document.createElement('div');
    page.className = 'print-page';
    page.appendChild(clone);
    overlay.appendChild(page);

    document.head.appendChild(style);
    document.body.appendChild(overlay);

    const originalTitle = document.title;
    document.title = title;
    await new Promise(r => setTimeout(r, 120));
    window.print();

    setTimeout(() => {
      document.title = originalTitle;
      overlay.remove();
      style.remove();
    }, 500);
  },

  // ── Relatório Técnico do Aluno — nova geração com JSON estruturado ───────────
  async exportRelatorioAlunoPDF(params: {
    student: Student;
    resultado: import('../services/reportService').RelatorioResultado;
    scores: number[];
    school?: SchoolConfig | null;
    createdBy?: string;
  }) {
    const { student, resultado, scores, school, createdBy = 'Sistema' } = params;
    const { data, geradoEm } = resultado;
    const codigoDoc = ensureDocumentCode('registration', resultado.codigoDoc);

    const jsPDF  = await loadJsPDF();
    const doc    = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const W      = doc.internal.pageSize.getWidth();
    const H      = doc.internal.pageSize.getHeight();
    const maxW   = W - ML - MR;
    const BOT    = H - BOTTOM_MARGIN - FOOTER_H;

    // ── cabeçalho corrente (páginas 2+) ────────────────────────────────────
    const addRunHdr = () => {
      const schoolLabel = school?.schoolName?.trim() || student.schoolName || '';
      if (school?.logoUrl) {
        try {
          const fmt = school.logoUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
          doc.addImage(school.logoUrl, fmt, ML, 1.5, 6, 6);
        } catch {}
      }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7); sc(doc, DARK);
      doc.text(schoolLabel.toUpperCase() || 'RELATÓRIO TÉCNICO', ML + (school?.logoUrl ? 8 : 0), 6);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7); sc(doc, GRAY);
      doc.text(`RELATÓRIO — ${student.name.toUpperCase()}`, W / 2, 6, { align: 'center' });
      doc.setFont('courier', 'normal'); doc.setFontSize(6.5); sc(doc, GRAY);
      doc.text(codigoDoc, W - MR, 6, { align: 'right' });
      sdd(doc, BORDER); doc.setLineWidth(0.3);
      doc.line(ML, 10, W - MR, 10);
      return 14;
    };

    // ── rodapé com QR ──────────────────────────────────────────────────────
    const addFooter = () => {
      const fY  = H - BOTTOM_MARGIN - FOOTER_H + 2;
      const pgN = doc.internal.getCurrentPageInfo().pageNumber;
      const tot = doc.internal.getNumberOfPages();
      sf(doc, BRAND); doc.rect(ML, fY, maxW, 0.6, 'F');
      sf(doc, GOLD);  doc.rect(ML, fY + 0.6, maxW, 0.25, 'F');
      doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); sc(doc, GRAY);
      const dtStr = new Date(geradoEm).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
      doc.text(`Emitido por: ${createdBy}  ·  ${dtStr}`, ML, fY + 5.5);
      doc.setFont('helvetica', 'bold'); sc(doc, BRAND);
      doc.text('INCLUIAI', W / 2, fY + 5.5, { align: 'center' });
      doc.setFont('helvetica', 'normal'); sc(doc, GRAY);
      doc.text(`Página ${pgN} de ${tot}`, W - MR, fY + 5.5, { align: 'right' });
      doc.setFont('courier', 'normal'); doc.setFontSize(6); sc(doc, BRAND);
      doc.text(`Código de Registro ${codigoDoc}`, ML, fY + 9.5);
    };

    // ── helpers internos ───────────────────────────────────────────────────
    const LINE = 5.0;
    const LSMALL = 4.4;

    let y = 0;
    let page = 1;

    const ensureSpace = (needed: number) => {
      if (y + needed > BOT) {
        addFooter();
        doc.addPage();
        page++;
        y = addRunHdr();
      }
    };

    const addParagraph = (text: string, size = BODY_SIZE, color = DARK) => {
      if (!text?.trim()) return;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(size);
      sc(doc, color);
      const lines: string[] = doc.splitTextToSize(text.trim(), maxW);
      for (const line of lines) {
        ensureSpace(LINE + 1);
        doc.text(line, ML, y);
        y += LINE;
      }
      y += 2;
    };

    const addSection = (title: string) => {
      ensureSpace(14);
      y += 3;
      sf(doc, BRAND);
      doc.roundedRect(ML, y, maxW, 7.5, 1, 1, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(F_SECTION_SIZE);
      sc(doc, WHITE);
      doc.text(title.toUpperCase(), ML + 4, y + 5);
      y += 10;
    };

    const addBulletList = (items: string[], color = DARK) => {
      if (!items?.length) return;
      for (const item of items.filter(Boolean)) {
        const lines: string[] = doc.splitTextToSize(`• ${item}`, maxW - 4);
        ensureSpace(lines.length * LSMALL + 2);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(BODY_SIZE - 0.5);
        sc(doc, color);
        doc.text(lines, ML + 3, y);
        y += lines.length * LSMALL + 1.5;
      }
      y += 2;
    };

    const addKeyValue = (label: string, value: string) => {
      if (!value?.trim()) return;
      ensureSpace(LINE + 2);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(BODY_SIZE - 0.5); sc(doc, BRAND);
      doc.text(`${label}:`, ML, y);
      const lw = doc.getTextWidth(`${label}: `);
      doc.setFont('helvetica', 'normal'); sc(doc, DARK);
      const valLines: string[] = doc.splitTextToSize(value, maxW - lw - 2);
      doc.text(valLines[0] || '', ML + lw, y);
      y += LINE;
      if (valLines.length > 1) {
        for (let i = 1; i < valLines.length; i++) {
          ensureSpace(LINE);
          doc.text(valLines[i], ML + lw, y);
          y += LSMALL;
        }
      }
    };

    // ══ PÁGINA 1 — CAPA ═══════════════════════════════════════════════════════

    const bannerH = 46;
    sf(doc, BRAND); doc.rect(0, 0, W, bannerH, 'F');
    sf(doc, GOLD);  doc.rect(0, bannerH, W, 1.5, 'F');

    // Logo escola
    let nameX = ML;
    if (school?.logoUrl) {
      try {
        const fmt = school.logoUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
        doc.addImage(school.logoUrl, fmt, ML, 3, 9, 9);
        nameX = ML + 11;
      } catch {}
    }
    const schoolName = school?.schoolName?.trim() || student.schoolName || 'Escola não informada';
    const cityLine   = [school?.city, school?.state].filter(Boolean).join(' – ');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); sc(doc, WHITE);
    const snLines: string[] = doc.splitTextToSize(schoolName.toUpperCase(), W - nameX - MR - 4);
    doc.text(snLines, nameX, 8);
    if (cityLine) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); sc(doc, [175, 210, 228] as [number,number,number]);
      doc.text(cityLine, nameX, 8 + snLines.length * 4.2);
    }
    sf(doc, GOLD); doc.rect(ML, 17, maxW, 0.3, 'F');

    // Título do documento
    const docTitle = data.tipo === 'completo'
      ? 'RELATÓRIO TÉCNICO PEDAGÓGICO COMPLETO'
      : 'RELATÓRIO TÉCNICO PEDAGÓGICO';
    doc.setFont('helvetica', 'bold'); doc.setFontSize(15); sc(doc, WHITE);
    doc.text(docTitle, ML, 25);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); sc(doc, [175, 215, 232] as [number,number,number]);
    doc.text('Educação Inclusiva — Atendimento Educacional Especializado', ML, 33);

    // Código e data (direita)
    doc.setFont('courier', 'normal'); doc.setFontSize(7); sc(doc, GOLD);
    doc.text(codigoDoc, W - MR, 33, { align: 'right' });

    // Metadados abaixo do banner
    y = bannerH + 7;
    const dtFull = new Date(geradoEm).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); sc(doc, GRAY);
    doc.text(`Código de Registro: ${codigoDoc}  |  Gerado em: ${dtFull}  |  Gerado por: ${createdBy}`, ML, y);
    sdd(doc, BORDER); doc.setLineWidth(0.3);
    doc.line(ML, y + 4, W - MR, y + 4);
    y += 10;

    // Bloco do aluno
    sf(doc, BRAND_LIGHT);
    doc.roundedRect(ML, y, maxW, 28, 2, 2, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); sc(doc, BRAND);
    doc.text(student.name.toUpperCase(), ML + 4, y + 8);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); sc(doc, DARK);
    const diagnoseStr = (student.diagnosis || []).join(', ') || 'A confirmar';
    doc.text(`Diagnóstico: ${diagnoseStr}`, ML + 4, y + 14);
    const gradeShift = [student.grade, student.shift].filter(Boolean).join(' — ');
    if (gradeShift) doc.text(gradeShift, ML + 4, y + 19);
    const supportStr = `Nível de Suporte: ${student.supportLevel || 'A definir'}`;
    doc.text(supportStr, ML + 4, y + 24);
    y += 36;

    // ══ SEÇÕES DO RELATÓRIO ════════════════════════════════════════════════════

    if (data.tipo === 'completo' && (data as any).resumoExecutivo) {
      // Resumo executivo: caixa highlight antes das seções
      const resumo: string = (data as any).resumoExecutivo;
      ensureSpace(20);
      const resumoLines: string[] = doc.splitTextToSize(resumo.trim(), maxW - 8);
      const boxH = resumoLines.length * LINE + 8;
      sf(doc, [230, 245, 248] as [number, number, number]);
      doc.roundedRect(ML, y, maxW, boxH, 2, 2, 'F');
      sdd(doc, BRAND); doc.setLineWidth(0.5);
      doc.roundedRect(ML, y, maxW, boxH, 2, 2, 'S');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); sc(doc, BRAND);
      doc.text('RESUMO EXECUTIVO', ML + 4, y + 4.5);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(BODY_SIZE - 0.5); sc(doc, DARK);
      doc.text(resumoLines, ML + 4, y + 9);
      y += boxH + 6;
    }

    if (data.identificacao) {
      addSection('Identificação do Aluno');
      addParagraph(data.identificacao);
    }

    if (data.tipo === 'completo' && (data as any).historicoRelevante) {
      addSection('Histórico Relevante');
      addParagraph((data as any).historicoRelevante);
    }

    const sitPed = data.tipo === 'completo'
      ? ((data as any).analisePedagogica || (data as any).situacaoPedagogica)
      : (data as any).situacaoPedagogicaAtual;
    if (sitPed) {
      addSection(data.tipo === 'completo' ? 'Análise Pedagógica' : 'Situação Pedagógica Atual');
      addParagraph(sitPed);
    }

    if (data.situacaoFuncional) {
      addSection('Situação Funcional');
      addParagraph(data.situacaoFuncional);
    }

    if (data.tipo === 'completo' && data.perfilCognitivo) {
      addSection('Perfil Cognitivo e Funcional');
      addParagraph(data.perfilCognitivo);
    }

    if (data.dificuldades?.length) {
      addSection('Dificuldades Observadas');
      addBulletList(data.dificuldades, DARK);
    }

    if (data.tipo === 'completo' && data.potencialidades?.length) {
      addSection('Potencialidades e Habilidades');
      addBulletList(data.potencialidades, DARK);
    }

    if (data.tipo === 'completo' && data.estrategiasEficazes?.length) {
      addSection('Estratégias com Resultados Positivos');
      addBulletList(data.estrategiasEficazes, DARK);
    }

    // Checklist textual (completo)
    if (data.tipo === 'completo' && data.checklist?.length) {
      addSection('Checklist de Áreas de Desenvolvimento');
      const grauLabel: Record<string, string> = {
        leve: 'Leve', moderado: 'Moderado', intenso: 'Intenso',
      };
      for (const item of data.checklist) {
        const grau = item.grau ? ` [${grauLabel[item.grau] ?? item.grau}]` : '';
        const status = item.presente ? `⚠ ${item.area}${grau}` : `✓ ${item.area} — Preservado`;
        const obs = item.obs ? `  ${item.obs}` : '';
        ensureSpace(LSMALL + 2);
        doc.setFont('helvetica', item.presente ? 'bold' : 'normal');
        doc.setFontSize(BODY_SIZE - 0.5);
        sc(doc, item.presente ? DARK : GRAY);
        doc.text(status + obs, ML + 3, y);
        y += LSMALL + 1.5;
      }
      y += 2;
    }

    if (data.tipo === 'completo' && data.evolucaoObservada) {
      addSection('Evolução Observada');
      addParagraph(data.evolucaoObservada);
    }

    if (data.observacoesRelevantes) {
      addSection('Observações Relevantes');
      addParagraph(data.observacoesRelevantes);
    }

    // Scores (quando disponíveis)
    if (scores.length) {
      addSection('Avaliação Multidimensional (Escala 1–5)');
      const criteriaNames = [
        'Comunicação Expressiva', 'Interação Social', 'Autonomia (AVD)',
        'Autorregulação', 'Atenção Sustentada', 'Compreensão',
        'Motricidade Fina', 'Motricidade Grossa', 'Participação', 'Linguagem/Leitura',
      ];
      const barW = 40;
      const startX = ML + 55;
      for (let i = 0; i < criteriaNames.length; i++) {
        const s = scores[i] ?? 1;
        const pct = (s / 5) * 100;
        const scoreColors: [number,number,number] =
          s >= 4 ? [22, 163, 74] : s >= 3 ? [124, 58, 237] : s >= 2 ? [217, 119, 6] : [220, 38, 38];
        ensureSpace(LSMALL + 2);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8); sc(doc, DARK);
        doc.text(criteriaNames[i], ML, y + 0.5);
        sf(doc, [229, 231, 235] as [number,number,number]);
        doc.roundedRect(startX, y - 3, barW, 4, 0.5, 0.5, 'F');
        sf(doc, scoreColors);
        doc.roundedRect(startX, y - 3, barW * (pct / 100), 4, 0.5, 0.5, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); sc(doc, scoreColors);
        doc.text(`${s}/5`, startX + barW + 2, y + 0.5);
        y += LSMALL + 1.5;
      }
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      ensureSpace(LINE + 4);
      y += 2;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(BODY_SIZE); sc(doc, BRAND);
      doc.text(`Média geral: ${avg.toFixed(1)}/5`, ML, y);
      y += LINE + 2;
    }

    // Gráfico de dificuldades (completo, quando disponível no JSON)
    const graficoDific: Array<{label: string; valor: number; max: number}> =
      data.tipo === 'completo' ? ((data as any).graficoDificuldades ?? []) : [];
    if (graficoDific.length) {
      addSection('Grau das Dificuldades Identificadas');
      const grauLabel = ['', 'Leve', 'Moderado', 'Intenso'];
      const grauColors: [number,number,number][] = [
        [0,0,0], [217, 119, 6], [220, 130, 38], [220, 38, 38],
      ];
      const barW2 = 40;
      const startX2 = ML + 60;
      for (const pt of graficoDific) {
        const v = Math.min(Math.max(pt.valor, 1), pt.max);
        const pct2 = v / pt.max;
        const col: [number,number,number] = grauColors[v] ?? [220, 38, 38];
        ensureSpace(LSMALL + 2);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8); sc(doc, DARK);
        doc.text(pt.label, ML, y + 0.5);
        sf(doc, [229, 231, 235] as [number,number,number]);
        doc.roundedRect(startX2, y - 3, barW2, 4, 0.5, 0.5, 'F');
        sf(doc, col);
        doc.roundedRect(startX2, y - 3, barW2 * pct2, 4, 0.5, 0.5, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); sc(doc, col);
        doc.text(grauLabel[v] || '', startX2 + barW2 + 2, y + 0.5);
        y += LSMALL + 1.5;
      }
      y += 2;
    }

    // Conclusão
    if (data.conclusao) {
      addSection('Conclusão e Parecer Técnico');
      ensureSpace(8);
      sf(doc, BRAND_LIGHT);
      const conclusaoLines: string[] = doc.splitTextToSize(data.conclusao.trim(), maxW - 8);
      const boxH = conclusaoLines.length * LINE + 8;
      doc.roundedRect(ML, y, maxW, boxH, 2, 2, 'F');
      doc.setFont('helvetica', 'normal'); doc.setFontSize(BODY_SIZE); sc(doc, DARK);
      doc.text(conclusaoLines, ML + 4, y + 5);
      y += boxH + 4;
    }

    // Recomendações
    if (data.tipo === 'completo') {
      const recs = [
        { title: 'Recomendações Pedagógicas',    items: (data as any).recomendacoesPedagogicas },
        { title: 'Recomendações Clínicas',        items: (data as any).recomendacoesClinicas },
        { title: 'Recomendações Familiares',      items: (data as any).recomendacoesFamiliares },
        { title: 'Recomendações Institucionais',  items: (data as any).recomendacoesInstitucionais },
      ].filter(r => r.items?.length);
      if (recs.length) {
        addSection('Recomendações Multidisciplinares');
        for (const r of recs) {
          ensureSpace(LINE + 2);
          doc.setFont('helvetica', 'bold'); doc.setFontSize(BODY_SIZE - 0.5); sc(doc, BRAND);
          doc.text(`${r.title}:`, ML, y);
          y += LINE;
          addBulletList(r.items);
        }
      }
    } else {
      if ((data as any).recomendacoes?.length) {
        addSection('Recomendações');
        addBulletList((data as any).recomendacoes);
      }
    }

    // Rodapé de todas as páginas
    const total = doc.internal.getNumberOfPages();
    for (let i = 1; i <= total; i++) {
      doc.setPage(i);
      addFooter();
    }

    const safeName = student.name.replace(/\s+/g, '_');
    const tipo = data.tipo === 'completo' ? 'Completo' : 'Simples';
    doc.save(`Relatorio_${tipo}_${safeName}.pdf`);
  },
};
