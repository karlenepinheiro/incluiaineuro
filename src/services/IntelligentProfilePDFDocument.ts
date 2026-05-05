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
const M = { l: 18, r: 18, t: 15, b: 12 };
const FOOTER_H = 12;
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
const TITLE = 20;
const SUBTITLE = 9.2;
const SECTION = 10.4;
const CARD_TITLE = 10.8;
const BODY = 8.9;
const SMALL = 7.5;
const TINY = 6.8;
const LINE = 4.5;
const SMALL_LINE = 3.85;
const GAP = 5;

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

export async function IntelligentProfilePDFDocument(params: IntelligentProfilePDFParams): Promise<void> {
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
    const identityX = drawLogo(M.l, 17, 12);

    text('bold', 8.4, [148, 163, 184]);
    doc.text(schoolName.toUpperCase(), identityX, 25);
    if (cityLine) {
      text('normal', TINY, GRAY);
      doc.text(cityLine, identityX, 29);
    }

    text('bold', TITLE, DARK);
    doc.text('Perfil Inteligente do Aluno', M.l, 34);
    text('normal', SUBTITLE, PETROL);
    doc.text(`Leitura Pedagógica e Neuropedagógica - Versão ${versionNumber}`, M.l, 40);

    const metaW = 45;
    const metaX = PAGE.w - M.r - metaW;
    const metaY = 20;
    roundedCard(metaX, metaY, metaW, 23, CARD_BG, BORDER);
    text('normal', TINY, GRAY);
    doc.text('#  Código de Registro', metaX + 5, metaY + 6);
    doc.setFont('courier', 'bold');
    doc.setFontSize(9.4);
    setTextColor(doc, DARK);
    doc.text(registerCode, metaX + 5, metaY + 13.2);
    text('normal', 6.2, [148, 163, 184]);
    doc.text(`Gerado em: ${genDate}`, metaX + metaW - 5, metaY + 19, { align: 'right' });

    setDrawColor(doc, [214, 224, 235]);
    doc.setLineWidth(0.28);
    doc.line(M.l, 48, PAGE.w - M.r, 48);
    return 55;
  }

  function drawRunningHeader(): number {
    drawPageShell();
    text('bold', SMALL, PETROL);
    doc.text(clean(school?.schoolName?.trim(), 'Sistema IncluiAI'), M.l, 9);
    text('normal', SMALL, GRAY);
    doc.text('Perfil Inteligente do Aluno', PAGE.w / 2, 9, { align: 'center' });
    doc.setFont('courier', 'normal');
    doc.setFontSize(SMALL);
    setTextColor(doc, GRAY);
    doc.text(`Registro: ${registerCode}`, PAGE.w - M.r, 9, { align: 'right' });
    setDrawColor(doc, BORDER);
    doc.setLineWidth(0.2);
    doc.line(M.l, 13.5, PAGE.w - M.r, 13.5);
    return 20;
  }

  function section(label: string, y: number): number {
    y = keepTogether(y, 18);
    text('bold', SECTION, DARK);
    const width = doc.getTextWidth(label);
    const lineW = Math.max(18, (CONTENT_W - width - 14) / 2);
    setDrawColor(doc, [214, 224, 235]);
    doc.setLineWidth(0.2);
    doc.line(M.l, y, M.l + lineW, y);
    doc.text(label, M.l + lineW + 7, y + 1.8);
    doc.line(M.l + lineW + width + 14, y, PAGE.w - M.r, y);
    return y + 11;
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
    const h = 66;
    y = keepTogether(y, h + GAP);

    const photoX = M.l + 2;
    const photoY = y + 8;
    roundedCard(photoX, photoY, 30, 30, [226, 235, 244], [220, 230, 238]);
    if (photo) {
      try {
        const format = photo.startsWith('data:image/png') ? 'PNG' : 'JPEG';
        doc.addImage(photo, format, photoX + 1.5, photoY + 1.5, 27, 27, undefined, 'FAST');
      } catch {
        text('bold', 12, PETROL);
        doc.text(initials(student.name), photoX + 15, photoY + 17.5, { align: 'center' });
      }
    } else {
      text('bold', 12, PETROL);
      doc.text(initials(student.name), photoX + 15, photoY + 17.5, { align: 'center' });
    }

    const infoX = photoX + 38;
    const infoW = CONTENT_W - 42;
    text('bold', 14.2, DARK);
    doc.text(wrap(student.name, infoW, 14.2, 'bold'), infoX, y + 12);

    const topFields: Array<[string, string, number]> = [
      ['IDADE / NASC.', [calcAge(student.birthDate), formatBirthDate(student.birthDate)].filter(Boolean).join(' | '), 0],
      ['SÉRIE / TURNO', [student.grade, student.shift].filter(Boolean).join(' - '), 43],
    ];
    for (const [label, value, dx] of topFields) {
      text('bold', TINY, [148, 163, 184]);
      doc.text(label, infoX + dx, y + 25);
      text('bold', SMALL, DARK);
      doc.text(wrap(value || '-', 38, SMALL, 'bold'), infoX + dx, y + 29.5);
    }

    const support = clean(student.supportLevel, '');
    if (support) {
      const sx = PAGE.w - M.r - 38;
      roundedCard(sx, y + 22, 38, 17, SOFT_GOLD, [240, 209, 133]);
      text('bold', TINY, [148, 103, 8]);
      doc.text('NÍVEL DE SUPORTE', sx, y + 18.7);
      text('bold', 8, [180, 83, 9]);
      doc.text(wrap(support, 31, 8, 'bold'), sx + 3, y + 28);
    }

    if (diagnosis) {
      text('bold', TINY, [148, 163, 184]);
      doc.text('DIAGNÓSTICOS (CID)', infoX, y + 45);
      const chipW = Math.min(78, doc.getTextWidth(diagnosis) + 10);
      roundedCard(infoX, y + 48, chipW, 8, [238, 241, 255], [219, 224, 255]);
      text('bold', SMALL, [80, 70, 190]);
      doc.text(wrap(diagnosis, chipW - 8, SMALL, 'bold')[0], infoX + 5, y + 53.5);
    }

    const lower: Array<[string, string | undefined]> = [
      ['PROF. REGENTE', student.regentTeacher],
      ['PROF. AEE', student.aeeTeacher],
      ['USO DE MEDICAÇÃO', student.medication || 'Não'],
    ];
    const lowerW = (infoW - 10) / 3;
    lower.forEach(([label, value], index) => {
      const x = infoX + index * (lowerW + 5);
      text('bold', TINY, [148, 163, 184]);
      doc.text(label, x, y + 61);
      text('bold', SMALL, DARK);
      doc.text(wrap(clean(value, '-'), lowerW, SMALL, 'bold')[0], x, y + 65.5);
    });

    return y + h + GAP;
  }

  function drawWhoAmI(y: number): number {
    const letter = clean(profile.firstPersonLetter || profile.humanizedIntroduction?.text);
    const lines = wrap(letter, CONTENT_W - 28, 10.1, 'italic');
    const h = Math.max(60, linesHeight(lines, 5.8) + 31);
    y = keepTogether(y, h + GAP);
    roundedCard(M.l, y, CONTENT_W, h, PURPLE, PURPLE_DARK);
    setFillColor(doc, [122, 82, 246]);
    doc.roundedRect(M.l + CONTENT_W * 0.55, y + 0.4, CONTENT_W * 0.45 - 0.8, h - 0.8, 2.2, 2.2, 'F');
    setFillColor(doc, [132, 105, 248]);
    setDrawColor(doc, [170, 150, 252]);
    doc.circle(M.l + 14, y + 15, 5.5, 'FD');
    text('bold', 13.2, WHITE);
    doc.text('Quem sou eu?', M.l + 24, y + 17);
    text('italic', 10.1, WHITE);
    doc.text(lines, M.l + 12, y + 31);
    return y + h + GAP + 4;
  }

  function statusRowHeight(item: ChecklistItem, width: number): number {
    const label = STATUS_LABELS[item.status] ?? STATUS_LABELS.nao_observado;
    const pillW = Math.max(18, doc.getTextWidth(label) + 6);
    const lines = wrap(item.label, Math.max(18, width - pillW - 8), SMALL);
    return Math.max(6.6, linesHeight(lines, SMALL_LINE) + 2);
  }

  function checklistHeight(items: ChecklistItem[], width: number): number {
    return items.length ? items.reduce((sum, item) => sum + statusRowHeight(item, width), 0) + 6 : 0;
  }

  function drawStatusRows(items: ChecklistItem[], x: number, y: number, width: number, title: string, quiet = false): number {
    if (!items.length) return y;
    text('bold', TINY, GRAY);
    doc.text(title, x, y);
    y += 6;
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
    doc.roundedRect(M.l + 7, y + 8, 8.5, 8.5, 2.2, 2.2, 'FD');
    text('bold', CARD_TITLE, tone.fg);
    doc.text(title, M.l + 20, y + 14);

    const sideW = 70;
    const textW = CONTENT_W - sideW - 24;
    const sideBySide = checklist.length > 0 && checklist.length <= 6;
    const bodyLines = wrap(body, sideBySide ? textW : CONTENT_W - 12, BODY);
    let contentY = y + 28;
    text('normal', BODY, DARK);
    doc.text(bodyLines, M.l + 8, contentY);

    if (checklist.length) {
      if (sideBySide) {
        const panelX = M.l + CONTENT_W - sideW - 8;
        roundedCard(panelX, y + 18, sideW, h - 28, STATUS_PANEL, [236, 241, 245]);
        drawStatusRows(checklist, panelX + 6, contentY, sideW - 12, tone.statusTitle, true);
      } else {
        contentY += linesHeight(bodyLines) + 5;
        drawStatusRows(checklist, M.l + 6, contentY, CONTENT_W - 12, tone.statusTitle);
      }
    }
    return y + h + GAP;
  }

  function analysisCardHeight(body: string, checklist: ChecklistItem[]): number {
    const sideW = 70;
    const textW = CONTENT_W - sideW - 24;
    const sideBySide = checklist.length > 0 && checklist.length <= 6;
    const bodyLines = wrap(body, sideBySide ? textW : CONTENT_W - 12, BODY);
    const statusH = checklistHeight(checklist, sideBySide ? sideW - 12 : CONTENT_W - 12);
    const contentH = sideBySide
      ? Math.max(linesHeight(bodyLines), statusH)
      : linesHeight(bodyLines) + (checklist.length ? statusH + 5 : 0);
    return 28 + contentH + 16;
  }

  function bulletHeight(value: string, width: number, size = BODY): number {
    return Math.max(6, wrap(value, width - 8, size).length * LINE + 2);
  }

  function drawBullet(value: string, x: number, y: number, width: number, color: RGB = GOLD, textColor: RGB = DARK): number {
    setFillColor(doc, color);
    setDrawColor(doc, color);
    doc.circle(x + 1.5, y - 1.5, 1.2, 'F');
    text('normal', BODY, textColor);
    const lines = wrap(value, width - 8, BODY);
    doc.text(lines, x + 6, y);
    return y + linesHeight(lines) + 1.4;
  }

  function drawChipListCard(y: number, title: string, items: string[], tone: { bg: RGB; fg: RGB; border: RGB }): number {
    const cleanItems = items.map(item => clean(item, '')).filter(Boolean);
    if (!cleanItems.length) return y;
    const colW = (CONTENT_W - 17) / 2;
    const rowHeights: number[] = [];
    for (let i = 0; i < cleanItems.length; i += 2) {
      const row = cleanItems.slice(i, i + 2);
      rowHeights.push(Math.max(...row.map(item => bulletHeight(item, colW - 6, SMALL)), 8));
    }
    const h = 18 + rowHeights.reduce((sum, value) => sum + value, 0) + 9;
    y = keepTogether(y, h + GAP);
    roundedCard(M.l, y, CONTENT_W, h, WHITE, tone.border);
    setFillColor(doc, tone.bg);
    setDrawColor(doc, tone.border);
    doc.roundedRect(M.l + 0.4, y + 0.4, CONTENT_W - 0.8, 12, 1.8, 1.8, 'F');
    text('bold', CARD_TITLE, tone.fg);
    doc.text(title, M.l + 5, y + 8);
    let cy = y + 18;
    let index = 0;
    for (const rowH of rowHeights) {
      for (let col = 0; col < 2; col++) {
        const item = cleanItems[index++];
        if (!item) continue;
        const x = M.l + 6 + col * (colW + 5);
        roundedCard(x, cy - 4, colW, rowH - 1, tone.bg, tone.border);
        drawBullet(item, x + 3, cy, colW - 6, tone.fg);
      }
      cy += rowH;
    }
    return y + h + GAP;
  }

  type ListItem = { title?: string; description: string };

  function listCardHeight(items: ListItem[], width: number): number {
    return 22 + items.reduce((sum, item) => {
      const value = item.title ? `${item.title}: ${item.description}` : item.description;
      return sum + bulletHeight(value, width - 12);
    }, 0) + 8;
  }

  function drawListCardAt(x: number, y: number, width: number, title: string, items: ListItem[], tone: { bg: RGB; fg: RGB; border: RGB }): number {
    const h = listCardHeight(items, width);
    roundedCard(x, y, width, h, tone.bg, tone.border);
    setFillColor(doc, WHITE);
    setDrawColor(doc, tone.border);
    doc.circle(x + 9, y + 10, 5.5, 'FD');
    text('bold', CARD_TITLE, tone.fg);
    doc.text(wrap(title, width - 28, CARD_TITLE, 'bold'), x + 18, y + 9);
    let cy = y + 24;
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
    const canUseColumns = learnItems.length > 0 && challenges.length > 0 && rowH <= 92;
    const firstBlockH = canUseColumns
      ? rowH
      : learnItems.length ? listCardHeight(learnItems, CONTENT_W) : listCardHeight(challenges, CONTENT_W);

    y = keepTogether(y + 1, 9 + firstBlockH + GAP);
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
    return 15 + linesHeight(titleLines, 4.3) + 8
      + 4 + linesHeight(objective, 4.1)
      + 5 + 4 + linesHeight(how, 4.0)
      + 5 + 4 + linesHeight(why, 4.0) + 8;
  }

  function drawActivityCard(x: number, y: number, width: number, activity: any): number {
    const h = activityHeight(activity, width);
    roundedCard(x, y, width, h);
    text('bold', 9.5, PETROL);
    doc.text(wrap(activity.title, width - 44, 9.5, 'bold'), x + 5, y + 8.2);

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

    let cy = y + 22;
    const fields: Array<[string, string, RGB, number, number]> = [
      ['OBJETIVO', activity.objective, PETROL, 8.5, 4.1],
      ['COMO APLICAR', activity.howToApply, [71, 85, 105], 8.3, 4.0],
      ['POR QUE AJUDA', activity.whyItHelps, [21, 128, 61], 8.3, 4.0],
    ];
    for (const [label, value, color, size, line] of fields) {
      text('bold', TINY, color);
      doc.text(label, x + 5, cy);
      cy += 4;
      text('normal', size, DARK);
      const lines = wrap(value, width - 12, size);
      doc.text(lines, x + 5, cy);
      cy += linesHeight(lines, line) + 5;
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
    const firstUsesColumns = !!activities[1] && firstH <= 112 && secondH <= 112;
    y = keepTogether(y + 1, 9 + (firstUsesColumns ? firstRowH : activityHeight(activities[0], CONTENT_W)) + GAP);
    y = section('PLANO DE INTERVENÇÃO PRÁTICA', y);
    let index = 0;
    while (index < activities.length) {
      const first = activities[index];
      const second = activities[index + 1];
      const firstH = activityHeight(first, colW);
      const secondH = second ? activityHeight(second, colW) : 0;
      const rowH = Math.max(firstH, secondH);
      const useColumns = !!second && firstH <= 112 && secondH <= 112;

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
    y = keepTogether(y + 1, 130);
    y = section('PONTOS DE OBSERVAÇÃO', y + 1);
    const leftW = (CONTENT_W - 12) * 0.48;
    const rightW = CONTENT_W - leftW - 12;
    const textLines = obsText ? wrap(obsText, leftW - 18, BODY) : [];
    const checkLines = checklist.map(item => wrap(item, rightW - 20, SMALL));
    const leftH = 32 + linesHeight(textLines, LINE) + 12;
    const rightH = 24 + checkLines.reduce((sum, lines) => sum + Math.max(7.2, linesHeight(lines, SMALL_LINE) + 3), 0) + 10;
    const h = Math.max(58, leftH, rightH) + 8;
    y = keepTogether(y, h + GAP);
    setFillColor(doc, NAVY);
    setDrawColor(doc, NAVY);
    doc.roundedRect(M.l, y, CONTENT_W, h, 3, 3, 'F');
    const panelX = M.l + leftW + 8;
    roundedCard(panelX, y + 8, rightW, h - 16, NAVY_DARK, [48, 62, 84]);
    text('bold', CARD_TITLE, WHITE);
    doc.text(wrap('Pontos de Observação (Diário de Bordo)', leftW - 18, CARD_TITLE, 'bold'), M.l + 14, y + 17);
    let cy = y + 34;
    if (textLines.length) {
      text('normal', BODY, [221, 231, 239]);
      doc.text(textLines, M.l + 8, cy);
    }
    if (checklist.length) {
      text('bold', TINY, [178, 208, 219]);
      doc.text('CHECKLIST DE AVALIAÇÃO DIÁRIA', panelX + 8, y + 18);
      cy = y + 30;
      for (const lines of checkLines) {
        setDrawColor(doc, [120, 142, 165]);
        doc.setLineWidth(0.25);
        doc.roundedRect(panelX + 8, cy - 3.5, 4, 4, 0.7, 0.7, 'D');
        text('bold', SMALL, [232, 238, 246]);
        doc.text(lines, panelX + 16, cy);
        cy += Math.max(7.2, linesHeight(lines, SMALL_LINE) + 3);
      }
    }
    return y + h + GAP;
  }

  function drawSignatures(y: number): number {
    const h = 55;
    y = keepTogether(y + 2, h + GAP);
    setDrawColor(doc, [214, 224, 235]);
    doc.setLineWidth(0.24);
    doc.line(M.l, y, PAGE.w - M.r, y);
    text('bold', TINY, [148, 163, 184]);
    doc.text('CIÊNCIA E VALIDAÇÃO DA EQUIPE MULTIDISCIPLINAR', PAGE.w / 2, y + 12, { align: 'center' });

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
      doc.line(x, y + 30, x + sigW, y + 30);
      text('bold', SMALL, DARK);
      doc.text(wrap(sig.name, sigW - 2, SMALL, 'bold').slice(0, 2), x + sigW / 2, y + 36, { align: 'center' });
      text('normal', TINY, GRAY);
      doc.text(wrap(sig.role, sigW - 2, TINY)[0] || sig.role, x + sigW / 2, y + 43, { align: 'center' });
    });

    text('italic', TINY, GRAY);
    const generatedLine = `Documento gerado pelo IncluiAI em ${genDate} às ${genTime} por ${generatedByName}. Versão ${versionNumber}. Código de Registro ${registerCode}.`;
    doc.text(wrap(generatedLine, CONTENT_W - 12, TINY, 'italic'), M.l + 6, y + 51);
    return y + h + GAP;
  }

  function addFooterAllPages(): void {
    const pages = doc.internal.getNumberOfPages();
    for (let page = 1; page <= pages; page++) {
      doc.setPage(page);
      const y = PAGE.h - 12;
      setDrawColor(doc, BORDER);
      doc.setLineWidth(0.2);
      doc.line(M.l, y, PAGE.w - M.r, y);
      text('normal', TINY, GRAY);
      doc.text('IncluiAI | Perfil Inteligente', M.l, y + 4.5);
      doc.setFont('courier', 'normal');
      doc.setFontSize(TINY);
      setTextColor(doc, GRAY);
      doc.text(`Registro ${registerCode}`, PAGE.w / 2, y + 4.5, { align: 'center' });
      text('normal', TINY, GRAY);
      doc.text(`Página ${page} de ${pages}`, PAGE.w - M.r, y + 4.5, { align: 'right' });
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
  drawSignatures(y);
  addFooterAllPages();

  const fileName = `PerfilInteligente_${student.name.replace(/\s+/g, '_')}_V${versionNumber}.pdf`;
  doc.save(fileName);
}
