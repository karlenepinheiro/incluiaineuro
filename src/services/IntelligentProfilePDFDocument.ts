import { jsPDF } from 'jspdf';
import type { Student, SchoolConfig } from '../types';
import type { IntelligentProfileJSON, ChecklistItem } from './intelligentProfileService';
import { generateDocumentCodeFromSeed } from '../utils/documentCodes';

type RGB = [number, number, number];

interface IntelligentProfilePDFParams {
  profile: IntelligentProfileJSON;
  student: Student;
  versionNumber: number;
  generatedAt: string;
  generatedByName: string;
  school?: SchoolConfig | null;
}

const PAGE = { w: 210, h: 297 };
// [COMPACTAÇÃO 09/2026] Margens e rodapé reduzidos de forma equilibrada — sem
// mexer no tamanho do corpo do texto. Ganho de ~4mm de área útil por página.
const M = { l: 15, r: 15, t: 12, b: 10 };
const FOOTER_H = 10;
const BODY_BOTTOM = PAGE.h - M.b - FOOTER_H;
const CONTENT_W = PAGE.w - M.l - M.r;

const PETROL: RGB = [31, 78, 95];
const PETROL_DARK: RGB = [26, 66, 80];
const GOLD: RGB = [198, 146, 20];
const DARK: RGB = [28, 32, 46];
const GRAY: RGB = [108, 117, 125];
const BORDER: RGB = [226, 232, 237];
const WHITE: RGB = [255, 255, 255];
const CARD_BG: RGB = [248, 250, 252];
const PAGE_SHELL: RGB = [247, 251, 253];
const PAGE_SHELL_BORDER: RGB = [225, 235, 242];
const STATUS_PANEL: RGB = [248, 250, 252];
const SOFT_BLUE: RGB = [238, 245, 248];
const SOFT_TEAL: RGB = [237, 249, 247];
const SOFT_GOLD: RGB = [253, 248, 236];
const SOFT_GREEN: RGB = [240, 253, 244];
const SOFT_ORANGE: RGB = [255, 247, 237];
const SOFT_RED: RGB = [255, 246, 246];
const PURPLE: RGB = [101, 62, 238];
const PURPLE_DARK: RGB = [92, 42, 218];
const NAVY: RGB = [28, 39, 58];
const NAVY_DARK: RGB = [20, 29, 48];

const FALLBACK_FONT = 'helvetica';
// [COMPACTAÇÃO 09/2026] Tamanhos de corpo preservados (BODY/SMALL). A redução de
// páginas vem de entrelinha (LINE), respiros entre blocos (GAP), títulos menos
// gigantes (TITLE/SECTION) e alturas de card — nunca de encolher a fonte.
const TITLE = 16;
const SUBTITLE = 8.6;
const SECTION = 9.8;
const CARD_TITLE = 10;
const BODY = 8.9;
const SMALL = 7.5;
const TINY = 6.7;
const LINE = 4.15;
const SMALL_LINE = 3.6;
const GAP = 3.4;

const STATUS_COLORS: Record<ChecklistItem['status'], RGB> = {
  presente: [22, 163, 74],
  em_desenvolvimento: [198, 146, 20],
  nao_observado: [156, 163, 175],
};

const STATUS_BG: Record<ChecklistItem['status'], RGB> = {
  presente: [240, 253, 244],
  em_desenvolvimento: [254, 252, 232],
  nao_observado: [248, 250, 252],
};

const STATUS_LABELS: Record<ChecklistItem['status'], string> = {
  presente: 'Presente',
  em_desenvolvimento: 'Em desenvolvimento',
  nao_observado: 'Nao observado',
};

const fontCache = new Map<string, string>();

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

async function ensureDocumentFont(doc: jsPDF): Promise<string> {
  const variants: Array<[string, string]> = [
    ['/fonts/LiberationSans-Regular.ttf', 'normal'],
    ['/fonts/LiberationSans-Bold.ttf', 'bold'],
    ['/fonts/LiberationSans-Italic.ttf', 'italic'],
  ];

  try {
    for (const [url, style] of variants) {
      const fileName = url.split('/').pop()!;
      if (!fontCache.has(fileName)) {
        const response = await fetch(url, { cache: 'force-cache' });
        if (!response.ok) throw new Error(`${response.status} ${fileName}`);
        fontCache.set(fileName, arrayBufferToBase64(await response.arrayBuffer()));
      }
      doc.addFileToVFS(fileName, fontCache.get(fileName)!);
      doc.addFont(fileName, 'LiberationSans', style, 'Identity-H');
    }
    return 'LiberationSans';
  } catch {
    return FALLBACK_FONT;
  }
}

function setTextColor(doc: jsPDF, color: RGB): void {
  doc.setTextColor(color[0], color[1], color[2]);
}

function setFillColor(doc: jsPDF, color: RGB): void {
  doc.setFillColor(color[0], color[1], color[2]);
}

function setDrawColor(doc: jsPDF, color: RGB): void {
  doc.setDrawColor(color[0], color[1], color[2]);
}

function clean(value: unknown, fallback = '—'): string {
  const text = String(value ?? '').replace(/\s+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  const safeText = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[º°]/g, 'o')
    .replace(/ª/g, 'a');
  return safeText || fallback;
}

function formatBirthDate(date?: string): string {
  if (!date) return '';
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(date)) return date;
  const iso = date.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  return date;
}

function calcAge(birthDate?: string): string {
  if (!birthDate) return '';
  const ddmm = birthDate.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const iso = birthDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const d = ddmm ? Number(ddmm[1]) : iso ? Number(iso[3]) : 0;
  const m = ddmm ? Number(ddmm[2]) : iso ? Number(iso[2]) : 0;
  const y = ddmm ? Number(ddmm[3]) : iso ? Number(iso[1]) : 0;
  if (!d || !m || !y) return '';
  const today = new Date();
  let age = today.getFullYear() - y;
  if (today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d)) age--;
  return age >= 0 ? `${age} anos` : '';
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

async function photoToDataUrl(photoUrl?: string): Promise<string | undefined> {
  if (!photoUrl) return undefined;
  if (photoUrl.startsWith('data:')) return photoUrl;
  try {
    const response = await fetch(photoUrl, { mode: 'cors' });
    if (!response.ok) return undefined;
    const blob = await response.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return undefined;
  }
}

export interface IntelligentProfilePDFResult {
  doc: jsPDF;
  blob: Blob;
  pageCount: number;
  fileName: string;
}

export interface IntelligentProfilePDFOptions {
  /**
   * Apenas para os testes de regressão de paginação: quando `false`, o bloco de
   * "Ciência e Validação da Equipe" (assinaturas) não é desenhado. Serve para
   * provar que as assinaturas NÃO estão empurrando o documento para uma página
   * isolada. Nunca usado em produção.
   */
  includeSignatures?: boolean;
}

/**
 * Monta o PDF do Perfil Inteligente e devolve o documento + Blob, SEM disparar
 * download. Usado pelo preview A4 (pdf.js) na aba e pelos testes de paginação.
 * O download continua sendo responsabilidade de `IntelligentProfilePDFDocument`.
 */
export async function buildIntelligentProfilePdf(
  params: IntelligentProfilePDFParams,
  options: IntelligentProfilePDFOptions = {},
): Promise<IntelligentProfilePDFResult> {
  const { profile, student, versionNumber, generatedAt, generatedByName, school } = params;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const docFont = await ensureDocumentFont(doc);
  const photo = await photoToDataUrl(student.photoUrl);

  const registerCode = generateDocumentCodeFromSeed(
    'registration',
    generatedAt,
    `${student.id}-${versionNumber}-${generatedAt}`,
  );
  const genDate = new Date(generatedAt).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
  const genTime = new Date(generatedAt).toLocaleTimeString('pt-BR', {
    hour: '2-digit', minute: '2-digit',
  });

  function text(style: 'normal' | 'bold' | 'italic' = 'normal', size = BODY, color: RGB = DARK): void {
    doc.setFont(docFont, style);
    doc.setFontSize(size);
    setTextColor(doc, color);
  }

  function wrap(value: unknown, width: number, size = BODY, style: 'normal' | 'bold' | 'italic' = 'normal'): string[] {
    doc.setFont(docFont, style);
    doc.setFontSize(size);
    return doc.splitTextToSize(clean(value), width) as string[];
  }

  function linesHeight(lines: string[], h = LINE): number {
    return Math.max(1, lines.length) * h;
  }

  function roundedCard(x: number, y: number, w: number, h: number, fill: RGB = WHITE, border: RGB = BORDER): void {
    setFillColor(doc, fill);
    setDrawColor(doc, border);
    doc.setLineWidth(0.22);
    doc.roundedRect(x, y, w, h, 2.4, 2.4, 'FD');
  }

  function drawPageShell(): void {
    setFillColor(doc, PAGE_SHELL);
    setDrawColor(doc, PAGE_SHELL_BORDER);
    doc.setLineWidth(0.18);
    doc.roundedRect(13, 13, PAGE.w - 26, PAGE.h - 28, 4, 4, 'FD');
  }

  function newPage(): number {
    doc.addPage();
    return drawRunningHeader();
  }

  function keepTogether(y: number, h: number): number {
    return y + h > BODY_BOTTOM ? newPage() : y;
  }

  function drawLogo(x: number, y: number, size: number): number {
    if (!school?.logoUrl) return x;
    try {
      const format = school.logoUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
      doc.addImage(school.logoUrl, format, x, y, size, size, undefined, 'FAST');
      return x + size + 4;
    } catch {
      return x;
    }
  }

  function drawDocumentHeader(): number {
    drawPageShell();
    const schoolName = clean(school?.schoolName?.trim(), 'Sistema IncluiAI');
    const cityLine = clean([school?.city, school?.state].filter(Boolean).join(' - '), '');
    const identityX = drawLogo(M.l, 15, 10);

    text('bold', 8, [148, 163, 184]);
    doc.text(schoolName.toUpperCase(), identityX, 20.5);
    if (cityLine) {
      text('normal', TINY, GRAY);
      doc.text(cityLine, identityX, 24);
    }

    text('bold', TITLE, DARK);
    doc.text('Perfil Inteligente do Aluno', M.l, 30);
    text('normal', SUBTITLE, PETROL);
    doc.text(`Leitura Pedagógica e Neuropedagógica - Versão ${versionNumber}`, M.l, 35);

    const metaW = 43;
    const metaX = PAGE.w - M.r - metaW;
    const metaY = 15;
    roundedCard(metaX, metaY, metaW, 19, CARD_BG, BORDER);
    text('normal', TINY, GRAY);
    doc.text('#  Código de Registro', metaX + 4.5, metaY + 5);
    doc.setFont('courier', 'bold');
    doc.setFontSize(9);
    setTextColor(doc, DARK);
    doc.text(registerCode, metaX + 4.5, metaY + 11);
    text('normal', 6, [148, 163, 184]);
    doc.text(`Gerado em: ${genDate}`, metaX + metaW - 4.5, metaY + 16, { align: 'right' });

    setDrawColor(doc, [214, 224, 235]);
    doc.setLineWidth(0.28);
    doc.line(M.l, 40, PAGE.w - M.r, 40);
    return 46;
  }

  function drawRunningHeader(): number {
    drawPageShell();
    text('bold', SMALL, PETROL);
    doc.text(clean(school?.schoolName?.trim(), 'Sistema IncluiAI'), M.l, 8.5);
    text('normal', SMALL, GRAY);
    doc.text('Perfil Inteligente do Aluno', PAGE.w / 2, 8.5, { align: 'center' });
    doc.setFont('courier', 'normal');
    doc.setFontSize(SMALL);
    setTextColor(doc, GRAY);
    doc.text(`Registro: ${registerCode}`, PAGE.w - M.r, 8.5, { align: 'right' });
    setDrawColor(doc, BORDER);
    doc.setLineWidth(0.2);
    doc.line(M.l, 12, PAGE.w - M.r, 12);
    return 18;
  }

  function section(label: string, y: number): number {
    y = keepTogether(y, 13);
    text('bold', SECTION, DARK);
    const width = doc.getTextWidth(label);
    const lineW = Math.max(16, (CONTENT_W - width - 14) / 2);
    setDrawColor(doc, [214, 224, 235]);
    doc.setLineWidth(0.2);
    doc.line(M.l, y, M.l + lineW, y);
    doc.text(label, M.l + lineW + 7, y + 1.6);
    doc.line(M.l + lineW + width + 14, y, PAGE.w - M.r, y);
    return y + 8;
  }

  function drawPhotoBox(x: number, y: number): void {
    roundedCard(x, y, 27, 27, SOFT_BLUE, [197, 221, 231]);
    if (photo) {
      try {
        const format = photo.startsWith('data:image/png') ? 'PNG' : 'JPEG';
        doc.addImage(photo, format, x + 1.5, y + 1.5, 24, 24, undefined, 'FAST');
        return;
      } catch {}
    }
    text('bold', 12, PETROL);
    doc.text(initials(student.name), x + 13.5, y + 16, { align: 'center' });
  }

  function drawStudentGrid(y: number): number {
    const diagnoses = [
      ...(Array.isArray(student.diagnosis) ? student.diagnosis : []),
      ...(Array.isArray(student.cid) ? student.cid : [student.cid]),
    ].map(value => String(value ?? '').trim()).filter(Boolean);
    const diagnosis = Array.from(new Set(diagnoses)).join(', ');
    const h = 47;
    y = keepTogether(y, h + GAP);

    const photoX = M.l + 1;
    const photoY = y + 5;
    roundedCard(photoX, photoY, 24, 24, [226, 235, 244], [220, 230, 238]);
    if (photo) {
      try {
        const format = photo.startsWith('data:image/png') ? 'PNG' : 'JPEG';
        doc.addImage(photo, format, photoX + 1.2, photoY + 1.2, 21.6, 21.6, undefined, 'FAST');
      } catch {
        text('bold', 11, PETROL);
        doc.text(initials(student.name), photoX + 12, photoY + 14, { align: 'center' });
      }
    } else {
      text('bold', 11, PETROL);
      doc.text(initials(student.name), photoX + 12, photoY + 14, { align: 'center' });
    }

    const infoX = photoX + 30;
    const infoW = CONTENT_W - 34;
    text('bold', 12.5, DARK);
    doc.text(wrap(student.name, infoW, 12.5, 'bold')[0], infoX, y + 8);

    const topFields: Array<[string, string, number]> = [
      ['IDADE / NASC.', [calcAge(student.birthDate), formatBirthDate(student.birthDate)].filter(Boolean).join(' | '), 0],
      ['SÉRIE / TURNO', [student.grade, student.shift].filter(Boolean).join(' - '), 42],
    ];
    for (const [label, value, dx] of topFields) {
      text('bold', TINY, [148, 163, 184]);
      doc.text(label, infoX + dx, y + 17);
      text('bold', SMALL, DARK);
      doc.text(wrap(value || '-', 38, SMALL, 'bold')[0], infoX + dx, y + 21.3);
    }

    const support = clean(student.supportLevel, '');
    if (support) {
      const sx = PAGE.w - M.r - 36;
      roundedCard(sx, y + 14, 36, 13, SOFT_GOLD, [240, 209, 133]);
      text('bold', TINY, [148, 103, 8]);
      doc.text('NÍVEL DE SUPORTE', sx + 3, y + 18.4);
      text('bold', 7.6, [180, 83, 9]);
      doc.text(wrap(support, 30, 7.6, 'bold')[0], sx + 3, y + 23.4);
    }

    if (diagnosis) {
      text('bold', TINY, [148, 163, 184]);
      doc.text('DIAGNÓSTICOS (CID)', infoX, y + 30);
      const chipW = Math.min(CONTENT_W - 32, doc.getTextWidth(diagnosis) + 10);
      roundedCard(infoX, y + 32, chipW, 7, [238, 241, 255], [219, 224, 255]);
      text('bold', SMALL, [80, 70, 190]);
      doc.text(wrap(diagnosis, chipW - 8, SMALL, 'bold')[0], infoX + 4, y + 36.6);
    }

    const lower: Array<[string, string | undefined]> = [
      ['PROF. REGENTE', student.regentTeacher],
      ['PROF. AEE', student.aeeTeacher],
      ['USO DE MEDICAÇÃO', student.medication || 'Não'],
    ];
    const lowerW = (infoW - 8) / 3;
    lower.forEach(([label, value], index) => {
      const x = infoX + index * (lowerW + 4);
      text('bold', TINY, [148, 163, 184]);
      doc.text(label, x, y + 43);
      text('bold', SMALL, DARK);
      doc.text(wrap(clean(value, '-'), lowerW, SMALL, 'bold')[0], x, y + 47);
    });

    return y + h + GAP;
  }

  function drawWhoAmI(y: number): number {
    const letter = clean(profile.firstPersonLetter || profile.humanizedIntroduction?.text);
    const lines = wrap(letter, CONTENT_W - 22, 9.6, 'italic');
    const h = Math.max(34, linesHeight(lines, 4.7) + 20);
    y = keepTogether(y, h + GAP);
    roundedCard(M.l, y, CONTENT_W, h, PURPLE, PURPLE_DARK);
    setFillColor(doc, [122, 82, 246]);
    doc.roundedRect(M.l + CONTENT_W * 0.58, y + 0.4, CONTENT_W * 0.42 - 0.8, h - 0.8, 2.2, 2.2, 'F');
    setFillColor(doc, [132, 105, 248]);
    setDrawColor(doc, [170, 150, 252]);
    doc.circle(M.l + 11, y + 10.5, 4.6, 'FD');
    text('bold', 11.5, WHITE);
    doc.text('Quem sou eu?', M.l + 19, y + 12);
    text('italic', 9.6, WHITE);
    doc.text(lines, M.l + 10, y + 21);
    return y + h + GAP;
  }

  function statusRowHeight(item: ChecklistItem, width: number): number {
    const label = STATUS_LABELS[item.status] ?? STATUS_LABELS.nao_observado;
    const pillW = Math.max(18, doc.getTextWidth(label) + 6);
    const lines = wrap(item.label, Math.max(18, width - pillW - 8), SMALL);
    return Math.max(5.4, linesHeight(lines, SMALL_LINE) + 1.4);
  }

  function checklistHeight(items: ChecklistItem[], width: number): number {
    return items.length ? items.reduce((sum, item) => sum + statusRowHeight(item, width), 0) + 4.5 : 0;
  }

  function drawStatusRows(items: ChecklistItem[], x: number, y: number, width: number, title: string, quiet = false): number {
    if (!items.length) return y;
    text('bold', TINY, GRAY);
    doc.text(title, x, y);
    y += 4.5;
    for (const item of items) {
      const rowH = statusRowHeight(item, width) + (quiet ? 2 : 0);
      const color = STATUS_COLORS[item.status] ?? STATUS_COLORS.nao_observado;
      const bg = STATUS_BG[item.status] ?? STATUS_BG.nao_observado;
      const label = STATUS_LABELS[item.status] ?? STATUS_LABELS.nao_observado;
      const pillW = Math.max(18, doc.getTextWidth(label) + 6);
      if (!quiet) roundedCard(x, y - 3.4, width, rowH, [252, 253, 254], BORDER);
      text('bold', SMALL, DARK);
      doc.text(wrap(item.label, Math.max(18, width - pillW - 8), SMALL, 'bold'), x + (quiet ? 0 : 3), y + 0.4);
      setFillColor(doc, bg);
      setDrawColor(doc, color);
      doc.setLineWidth(0.15);
      doc.roundedRect(x + width - pillW - (quiet ? 0 : 3), y - 2.2, pillW, 4.8, 1.6, 1.6, 'FD');
      text('bold', TINY, color);
      doc.text(label, x + width - pillW + (quiet ? 3 : 0), y + 1);
      y += rowH;
    }
    return y + 1;
  }

  function drawAnalysisCard(
    y: number,
    title: string,
    body: string,
    checklist: ChecklistItem[],
    tone: { bg: RGB; fg: RGB; border: RGB; statusTitle: string },
  ): number {
    const h = analysisCardHeight(body, checklist);
    y = keepTogether(y, h + GAP);
    roundedCard(M.l, y, CONTENT_W, h, WHITE, BORDER);
    setFillColor(doc, tone.bg);
    setDrawColor(doc, tone.border);
    doc.roundedRect(M.l + 6, y + 6, 7, 7, 2, 2, 'FD');
    text('bold', CARD_TITLE, tone.fg);
    doc.text(title, M.l + 17, y + 11);

    const sideW = 68;
    const textW = CONTENT_W - sideW - 22;
    const sideBySide = checklist.length > 0 && checklist.length <= 8;
    const bodyLines = wrap(body, sideBySide ? textW : CONTENT_W - 12, BODY);
    let contentY = y + 19;
    text('normal', BODY, DARK);
    doc.text(bodyLines, M.l + 8, contentY);

    if (checklist.length) {
      if (sideBySide) {
        const panelX = M.l + CONTENT_W - sideW - 7;
        roundedCard(panelX, y + 15, sideW, h - 22, STATUS_PANEL, [236, 241, 245]);
        drawStatusRows(checklist, panelX + 5, contentY, sideW - 10, tone.statusTitle, true);
      } else {
        contentY += linesHeight(bodyLines) + 3.5;
        drawStatusRows(checklist, M.l + 6, contentY, CONTENT_W - 12, tone.statusTitle);
      }
    }
    return y + h + GAP;
  }

  function analysisCardHeight(body: string, checklist: ChecklistItem[]): number {
    const sideW = 68;
    const textW = CONTENT_W - sideW - 22;
    const sideBySide = checklist.length > 0 && checklist.length <= 8;
    const bodyLines = wrap(body, sideBySide ? textW : CONTENT_W - 12, BODY);
    const statusH = checklistHeight(checklist, sideBySide ? sideW - 10 : CONTENT_W - 12);
    const contentH = sideBySide
      ? Math.max(linesHeight(bodyLines), statusH)
      : linesHeight(bodyLines) + (checklist.length ? statusH + 3.5 : 0);
    return 19 + contentH + 9;
  }

  function bulletHeight(value: string, width: number, size = BODY): number {
    return Math.max(4.6, wrap(value, width - 8, size).length * LINE + 1.2);
  }

  function drawBullet(value: string, x: number, y: number, width: number, color: RGB = GOLD, textColor: RGB = DARK): number {
    setFillColor(doc, color);
    setDrawColor(doc, color);
    doc.circle(x + 1.4, y - 1.4, 1.1, 'F');
    text('normal', BODY, textColor);
    const lines = wrap(value, width - 8, BODY);
    doc.text(lines, x + 5.5, y);
    return y + linesHeight(lines) + 0.9;
  }

  function drawChipListCard(y: number, title: string, items: string[], tone: { bg: RGB; fg: RGB; border: RGB }): number {
    const cleanItems = items.map(item => clean(item, '')).filter(Boolean);
    if (!cleanItems.length) return y;
    const colW = (CONTENT_W - 15) / 2;
    const rowHeights: number[] = [];
    for (let i = 0; i < cleanItems.length; i += 2) {
      const row = cleanItems.slice(i, i + 2);
      rowHeights.push(Math.max(...row.map(item => bulletHeight(item, colW - 6, SMALL)), 6.5));
    }
    const h = 14 + rowHeights.reduce((sum, value) => sum + value, 0) + 5;
    y = keepTogether(y, h + GAP);
    roundedCard(M.l, y, CONTENT_W, h, WHITE, tone.border);
    setFillColor(doc, tone.bg);
    setDrawColor(doc, tone.border);
    doc.roundedRect(M.l + 0.4, y + 0.4, CONTENT_W - 0.8, 9, 1.8, 1.8, 'F');
    text('bold', CARD_TITLE, tone.fg);
    doc.text(title, M.l + 5, y + 6.4);
    let cy = y + 14;
    let index = 0;
    for (const rowH of rowHeights) {
      for (let col = 0; col < 2; col++) {
        const item = cleanItems[index++];
        if (!item) continue;
        const x = M.l + 5 + col * (colW + 5);
        roundedCard(x, cy - 4, colW, rowH - 1, tone.bg, tone.border);
        drawBullet(item, x + 3, cy, colW - 6, tone.fg);
      }
      cy += rowH;
    }
    return y + h + GAP;
  }

  type ListItem = { title?: string; description: string };

  function listCardHeight(items: ListItem[], width: number): number {
    return 16 + items.reduce((sum, item) => {
      const value = item.title ? `${item.title}: ${item.description}` : item.description;
      return sum + bulletHeight(value, width - 12);
    }, 0) + 5;
  }

  function drawListCardAt(x: number, y: number, width: number, title: string, items: ListItem[], tone: { bg: RGB; fg: RGB; border: RGB }): number {
    const h = listCardHeight(items, width);
    roundedCard(x, y, width, h, tone.bg, tone.border);
    setFillColor(doc, WHITE);
    setDrawColor(doc, tone.border);
    doc.circle(x + 7.5, y + 8, 4.6, 'FD');
    text('bold', CARD_TITLE, tone.fg);
    doc.text(wrap(title, width - 24, CARD_TITLE, 'bold')[0], x + 15, y + 7.6);
    let cy = y + 18;
    for (const item of items) {
      const value = item.title ? `${item.title}: ${item.description}` : item.description;
      cy = drawBullet(value, x + 6, cy, width - 12, tone.fg);
    }
    return y + h;
  }

  function drawLearningAndCare(y: number): number {
    const learnItems = (profile.bestLearningStrategies?.items ?? [])
      .map(description => ({ description: clean(description, '') }))
      .filter(item => item.description);
    const challenges = (profile.challenges ?? (profile.carePoints ?? []).map(description => ({ title: 'Ponto de cuidado', description })))
      .map(item => ({ title: item.title, description: clean(item.description, '') }))
      .filter(item => item.description);
    if (!learnItems.length && !challenges.length) return y;

    const colW = (CONTENT_W - 6) / 2;
    const learnH = learnItems.length ? listCardHeight(learnItems, colW) : 0;
    const careH = challenges.length ? listCardHeight(challenges, colW) : 0;
    const rowH = Math.max(learnH, careH);
    const canUseColumns = learnItems.length > 0 && challenges.length > 0 && rowH <= 130;
    const firstBlockH = canUseColumns
      ? rowH
      : learnItems.length ? listCardHeight(learnItems, CONTENT_W) : listCardHeight(challenges, CONTENT_W);

    y = keepTogether(y, 6 + firstBlockH + GAP);
    y = section('COMO APRENDE MELHOR E PONTOS DE CUIDADO', y);

    if (canUseColumns) {
      y = keepTogether(y, rowH + GAP);
      drawListCardAt(M.l, y, colW, 'Como aprende melhor', learnItems, { bg: SOFT_GOLD, fg: [146, 105, 10], border: [240, 228, 181] });
      drawListCardAt(M.l + colW + 6, y, colW, 'Pontos de cuidado', challenges, { bg: SOFT_ORANGE, fg: [194, 65, 12], border: [253, 186, 116] });
      return y + rowH + GAP;
    }

    if (learnItems.length) {
      const h = listCardHeight(learnItems, CONTENT_W);
      y = keepTogether(y, h + GAP);
      y = drawListCardAt(M.l, y, CONTENT_W, 'Como aprende melhor', learnItems, { bg: SOFT_GOLD, fg: [146, 105, 10], border: [240, 228, 181] }) + GAP;
    }
    if (challenges.length) {
      const h = listCardHeight(challenges, CONTENT_W);
      y = keepTogether(y, h + GAP);
      y = drawListCardAt(M.l, y, CONTENT_W, 'Pontos de cuidado', challenges, { bg: SOFT_ORANGE, fg: [194, 65, 12], border: [253, 186, 116] }) + GAP;
    }
    return y;
  }

  function activityHeight(activity: any, width: number): number {
    const titleLines = wrap(activity.title, width - 44, 9.5, 'bold');
    const textW = width - 12;
    const objective = wrap(activity.objective, textW, 8.5);
    const how = wrap(activity.howToApply, textW, 8.3);
    const why = wrap(activity.whyItHelps, textW, 8.3);
    return 12 + linesHeight(titleLines, 4.0) + 5
      + 3 + linesHeight(objective, 3.9)
      + 3.5 + 3 + linesHeight(how, 3.8)
      + 3.5 + 3 + linesHeight(why, 3.8) + 5;
  }

  function drawActivityCard(x: number, y: number, width: number, activity: any): number {
    const h = activityHeight(activity, width);
    roundedCard(x, y, width, h);
    text('bold', 9.5, PETROL);
    doc.text(wrap(activity.title, width - 44, 9.5, 'bold'), x + 5, y + 7);

    const support = clean(activity.supportLevel, 'Médio');
    const supportColor: RGB = support === 'Baixo' ? [21, 128, 61] : support === 'Alto' ? [190, 18, 60] : [161, 98, 7];
    const supportBg: RGB = support === 'Baixo' ? [240, 253, 244] : support === 'Alto' ? [254, 242, 242] : [254, 252, 232];
    const supportText = `Apoio ${support}`;
    const pillW = Math.min(34, doc.getTextWidth(supportText) + 6);
    setFillColor(doc, supportBg);
    setDrawColor(doc, supportColor);
    doc.setLineWidth(0.15);
    doc.roundedRect(x + width - pillW - 4, y + 4, pillW, 4.8, 1, 1, 'FD');
    text('bold', TINY, supportColor);
    doc.text(supportText, x + width - pillW - 1.5, y + 7.2);

    let cy = y + 17;
    const fields: Array<[string, string, RGB, number, number]> = [
      ['OBJETIVO', activity.objective, PETROL, 8.5, 3.9],
      ['COMO APLICAR', activity.howToApply, [71, 85, 105], 8.3, 3.8],
      ['POR QUE AJUDA', activity.whyItHelps, [21, 128, 61], 8.3, 3.8],
    ];
    for (const [label, value, color, size, line] of fields) {
      text('bold', TINY, color);
      doc.text(label, x + 5, cy);
      cy += 3.4;
      text('normal', size, DARK);
      const lines = wrap(value, width - 12, size);
      doc.text(lines, x + 5, cy);
      cy += linesHeight(lines, line) + 3.5;
    }
    return y + h;
  }

  function drawActivities(y: number): number {
    const activities = profile.recommendedActivities ?? [];
    if (!activities.length) return y;
    const colW = (CONTENT_W - 6) / 2;
    const firstH = activityHeight(activities[0], colW);
    const secondH = activities[1] ? activityHeight(activities[1], colW) : 0;
    const firstRowH = Math.max(firstH, secondH);
    const firstUsesColumns = !!activities[1] && firstH <= 150 && secondH <= 150;
    y = keepTogether(y, 6 + (firstUsesColumns ? firstRowH : activityHeight(activities[0], CONTENT_W)) + GAP);
    y = section('PLANO DE INTERVENÇÃO PRÁTICA', y);
    let index = 0;
    while (index < activities.length) {
      const first = activities[index];
      const second = activities[index + 1];
      const firstH = activityHeight(first, colW);
      const secondH = second ? activityHeight(second, colW) : 0;
      const rowH = Math.max(firstH, secondH);
      const useColumns = !!second && firstH <= 150 && secondH <= 150;

      if (useColumns) {
        y = keepTogether(y, rowH + GAP);
        drawActivityCard(M.l, y, colW, first);
        drawActivityCard(M.l + colW + 6, y, colW, second);
        y += rowH + GAP;
        index += 2;
      } else {
        const fullH = activityHeight(first, CONTENT_W);
        y = keepTogether(y, fullH + GAP);
        y = drawActivityCard(M.l, y, CONTENT_W, first) + GAP;
        index += 1;
      }
    }
    return y;
  }

  function drawObservation(y: number): number {
    const obsText = clean(profile.observationPoints?.text, '');
    const checklist = profile.observationPoints?.checklist ?? [];
    if (!obsText && !checklist.length) return y;
    y = keepTogether(y, 70);
    y = section('PONTOS DE OBSERVAÇÃO', y);
    const leftW = (CONTENT_W - 12) * 0.48;
    const rightW = CONTENT_W - leftW - 12;
    const textLines = obsText ? wrap(obsText, leftW - 16, BODY) : [];
    const checkLines = checklist.map(item => wrap(item, rightW - 18, SMALL));
    const leftH = 22 + linesHeight(textLines, LINE) + 8;
    const rightH = 18 + checkLines.reduce((sum, lines) => sum + Math.max(6, linesHeight(lines, SMALL_LINE) + 2), 0) + 6;
    const h = Math.max(40, leftH, rightH) + 5;
    y = keepTogether(y, h + GAP);
    setFillColor(doc, NAVY);
    setDrawColor(doc, NAVY);
    doc.roundedRect(M.l, y, CONTENT_W, h, 3, 3, 'F');
    const panelX = M.l + leftW + 8;
    roundedCard(panelX, y + 6, rightW, h - 12, NAVY_DARK, [48, 62, 84]);
    text('bold', CARD_TITLE, WHITE);
    doc.text(wrap('Pontos de Observação (Diário de Bordo)', leftW - 16, CARD_TITLE, 'bold'), M.l + 10, y + 13);
    let cy = y + 26;
    if (textLines.length) {
      text('normal', BODY, [221, 231, 239]);
      doc.text(textLines, M.l + 8, cy);
    }
    if (checklist.length) {
      text('bold', TINY, [178, 208, 219]);
      doc.text('CHECKLIST DE AVALIAÇÃO DIÁRIA', panelX + 7, y + 15);
      cy = y + 24;
      for (const lines of checkLines) {
        setDrawColor(doc, [120, 142, 165]);
        doc.setLineWidth(0.25);
        doc.roundedRect(panelX + 7, cy - 3.5, 4, 4, 0.7, 0.7, 'D');
        text('bold', SMALL, [232, 238, 246]);
        doc.text(lines, panelX + 14, cy);
        cy += Math.max(6, linesHeight(lines, SMALL_LINE) + 2);
      }
    }
    return y + h + GAP;
  }

  function drawSignatures(y: number): number {
    const h = 40;
    y = keepTogether(y, h + GAP);
    setDrawColor(doc, [214, 224, 235]);
    doc.setLineWidth(0.24);
    doc.line(M.l, y, PAGE.w - M.r, y);
    text('bold', TINY, [148, 163, 184]);
    doc.text('CIÊNCIA E VALIDAÇÃO DA EQUIPE MULTIDISCIPLINAR', PAGE.w / 2, y + 8, { align: 'center' });

    const sigW = (CONTENT_W - 16) / 3;
    const signers = [
      { name: student.regentTeacher || 'Professor(a) Regente', role: 'Professor(a) Regente' },
      { name: student.aeeTeacher || 'Professor(a) do AEE', role: 'Professor(a) do AEE' },
      { name: 'Coordenação Pedagógica', role: school?.schoolName || 'Unidade Escolar' },
    ];
    signers.forEach((sig, i) => {
      const x = M.l + 6 + i * (sigW + 5);
      setDrawColor(doc, [181, 195, 204]);
      doc.setLineWidth(0.3);
      doc.line(x, y + 22, x + sigW, y + 22);
      text('bold', SMALL, DARK);
      doc.text(wrap(sig.name, sigW - 2, SMALL, 'bold').slice(0, 2), x + sigW / 2, y + 27, { align: 'center' });
      text('normal', TINY, GRAY);
      doc.text(wrap(sig.role, sigW - 2, TINY)[0] || sig.role, x + sigW / 2, y + 32, { align: 'center' });
    });

    text('italic', TINY, GRAY);
    const generatedLine = `Documento gerado pelo IncluiAI em ${genDate} às ${genTime} por ${generatedByName}. Versão ${versionNumber}. Código de Registro ${registerCode}.`;
    doc.text(wrap(generatedLine, CONTENT_W - 12, TINY, 'italic'), M.l + 6, y + 38);
    return y + h + GAP;
  }

  function addFooterAllPages(): void {
    const pages = doc.getNumberOfPages();
    for (let page = 1; page <= pages; page++) {
      doc.setPage(page);
      const y = PAGE.h - 9;
      setDrawColor(doc, BORDER);
      doc.setLineWidth(0.2);
      doc.line(M.l, y, PAGE.w - M.r, y);
      text('normal', TINY, GRAY);
      doc.text('IncluiAI | Perfil Inteligente', M.l, y + 3.8);
      doc.setFont('courier', 'normal');
      doc.setFontSize(TINY);
      setTextColor(doc, GRAY);
      doc.text(`Registro ${registerCode}`, PAGE.w / 2, y + 3.8, { align: 'center' });
      text('normal', TINY, GRAY);
      doc.text(`Página ${page} de ${pages}`, PAGE.w - M.r, y + 3.8, { align: 'right' });
    }
  }

  let y = drawDocumentHeader();
  y = drawStudentGrid(y);
  y = drawWhoAmI(y);
  y = section('ANÁLISE MULTIDISCIPLINAR', y);
  y = drawAnalysisCard(
    y,
    'Parecer Pedagógico Educacional',
    profile.pedagogicalReport?.text ?? '',
    profile.pedagogicalReport?.checklist ?? [],
    { bg: SOFT_BLUE, fg: [37, 99, 235], border: [219, 234, 254], statusTitle: 'STATUS DE HABILIDADES' },
  );
  y = drawAnalysisCard(
    y,
    'Parecer Neuropedagógico',
    profile.neuroPedagogicalReport?.text ?? '',
    profile.neuroPedagogicalReport?.checklist ?? [],
    { bg: [250, 245, 255], fg: [126, 34, 206], border: [233, 213, 255], statusTitle: 'STATUS COGNITIVO' },
  );
  y = drawChipListCard(y, 'Potencialidades', profile.strengths ?? profile.nextSteps ?? [], {
    bg: SOFT_GREEN, fg: [21, 128, 61], border: [167, 243, 208],
  });
  y = drawLearningAndCare(y);
  y = drawActivities(y);
  y = drawObservation(y);
  if (options.includeSignatures !== false) drawSignatures(y);
  addFooterAllPages();

  const fileName = `PerfilInteligente_${student.name.replace(/\s+/g, '_')}_V${versionNumber}.pdf`;
  const blob = doc.output('blob') as Blob;
  const pageCount = doc.getNumberOfPages();
  return { doc, blob, pageCount, fileName };
}

/** Gera o PDF e dispara o download (comportamento histórico da aba). */
export async function IntelligentProfilePDFDocument(params: IntelligentProfilePDFParams): Promise<void> {
  const { doc, fileName } = await buildIntelligentProfilePdf(params);
  doc.save(fileName);
}
