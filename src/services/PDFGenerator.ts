// services/PDFGenerator.ts
// IncluiAI — Design v2: Official Document Standard
// Reference: PAEE/PEI/Estudo de Caso mockup PDFs
import { Student, User, SchoolConfig } from '../types';
import type { DynChecklistSection } from '../components/DynamicChecklist';
import type { IntelligentProfileJSON, ChecklistItem as SIPChecklistItem } from './intelligentProfileService';
import { IntelligentProfilePDFDocument } from './IntelligentProfilePDFDocument';
import {
  INCLUIAI_SITE,
  ensureDocumentCode,
  formatGeneratedAt,
  getDocumentCodeKind,
  validationUrl,
  type DocumentCodeKind,
} from '../utils/documentCodes';
import QRCode from 'qrcode';

// ─── jsPDF CDN ────────────────────────────────────────────────────────────────
async function loadJsPDF(): Promise<any> {
  if ((window as any).jspdf?.jsPDF) return (window as any).jspdf.jsPDF;
  await new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Falha ao carregar jsPDF'));
    document.head.appendChild(s);
  });
  return (window as any).jspdf.jsPDF;
}

// ─── Layout A4 — Padrão Visual Premium IncluiAI ───────────────────────────────
// Margens 1.5 cm em todos os lados (A4 = 210 × 297 mm → área útil 180 × 267 mm)
const ML = 15;
const MR = 15;
const MB = 10;
const FOOTER_H  = 14;   // maior para 3 linhas de rodapé
const RUN_HDR_H = 12;   // cabeçalho de página com cidade/estado

// Hierarquia tipográfica (jsPDF usa pontos tipográficos)
const TITLE_SIZE   = 16;   // Título principal do documento
const SECTION_SIZE = 11;   // Cabeçalho de seção (faixa petrol)
const BODY_SIZE    = 10;   // Corpo de texto padrão
const LABEL_SIZE   = 9.5;  // Rótulos de campos
const TABLE_SIZE   = 9;    // Tabelas e checklists (2 colunas)
const SMALL_SIZE   = 8;    // Texto secundário / metadados
const TINY_SIZE    = 7.5;  // Rodapé e base legal
// Entrelinhamento: 10pt × 0,353 mm/pt × fator = espaço em mm
const LINE_H       = 5.0;  // Corpo: fator ~1,42 (entre 1,25 e 1,5)
const LINE_H_LIST  = 4.5;  // Listas: fator ~1,27

// ─── Palette ─────────────────────────────────────────────────────────────────
const PETROL: [number,number,number] = [31,  78,  95];
const GOLD:   [number,number,number] = [198, 146, 20];
const DARK:   [number,number,number] = [28,  32,  46];
const GRAY:   [number,number,number] = [108, 117, 125];
const BORDER: [number,number,number] = [218, 224, 229];
const WHITE:  [number,number,number] = [255, 255, 255];
const GBKG:   [number,number,number] = [248, 249, 250];

// ─── Noto Sans — carregamento progressivo via CDN ─────────────────────────────
// Substitui Helvetica pelo padrão visual premium (Noto Sans).
// Na 1ª chamada faz fetch + base64; nas seguintes usa cache em memória.
// Fallback silencioso para Helvetica em caso de falha de rede / CORS.
let _docFont = 'helvetica';
const _fontB64Cache = new Map<string, string>(); // file → base64

// ─── Metadados do documento corrente (usados no rodapé/cabeçalho) ─────────────
let _currentAuditCode = '';
let _currentUserName  = '';
let _currentSchool: SchoolConfig | null = null;
let _currentDocKind: DocumentCodeKind = 'registration';
let _currentGeneratedAt = new Date().toISOString();
let _currentQrDataUrl: string | undefined;

/** Converts ISO (YYYY-MM-DD) or DD/MM/YYYY to DD/MM/YYYY for display in PDFs. */
function formatBirthDate(date?: string): string {
  if (!date) return '';
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(date)) return date;
  const iso = date.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  return date;
}

/** Calcula idade em anos. Aceita DD/MM/YYYY ou ISO YYYY-MM-DD. Retorna '' se inválido. */
function calcAge(birthDate?: string): string {
  if (!birthDate) return '';
  let d = 0, m = 0, y = 0;
  const ddmm = birthDate.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const iso   = birthDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ddmm)     { d = +ddmm[1]; m = +ddmm[2]; y = +ddmm[3]; }
  else if (iso) { y = +iso[1];  m = +iso[2];  d = +iso[3];  }
  else return '';
  if (!y || !m || !d) return '';
  const today = new Date();
  let age = today.getFullYear() - y;
  if (today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d)) age--;
  return age >= 0 ? `${age} anos` : '';
}

function _arrBufToB64(buf: ArrayBuffer): string {
  let bin = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

async function ensureNotoSans(doc: any): Promise<void> {
  const CDN =
    'https://cdn.jsdelivr.net/gh/notofonts/notofonts.github.io@main/fonts/NotoSans/hinted/ttf';
  const variants: [string, string][] = [
    [`${CDN}/NotoSans-Regular.ttf`,     'normal'],
    [`${CDN}/NotoSans-Bold.ttf`,        'bold'],
    [`${CDN}/NotoSans-Italic.ttf`,      'italic'],
    [`${CDN}/NotoSans-BoldItalic.ttf`,  'bolditalic'],
  ];
  try {
    for (const [url, style] of variants) {
      const file = url.split('/').pop()!;
      if (!_fontB64Cache.has(file)) {
        const resp = await fetch(url, { cache: 'force-cache' });
        if (!resp.ok) throw new Error(`${resp.status} ${file}`);
        _fontB64Cache.set(file, _arrBufToB64(await resp.arrayBuffer()));
      }
      doc.addFileToVFS(file, _fontB64Cache.get(file)!);
      doc.addFont(file, 'NotoSans', style);
    }
    _docFont = 'NotoSans';
  } catch {
    _docFont = 'helvetica'; // rede indisponível — usa fonte padrão
  }
}

// ─── Micro-helpers ────────────────────────────────────────────────────────────
const sc = (d: any, c: [number,number,number]) => d.setTextColor(...c);
const sf = (d: any, c: [number,number,number]) => d.setFillColor(...c);
const sd = (d: any, c: [number,number,number]) => d.setDrawColor(...c);
const cBot = (H: number) => H - MB - FOOTER_H;

function getInitials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (!p.length) return '?';
  if (p.length === 1) return p[0][0].toUpperCase();
  return (p[0][0] + p[p.length - 1][0]).toUpperCase();
}

/**
 * Converte qualquer photoUrl (data URL ou HTTPS) em data URL PNG.
 * Para URLs HTTPS, faz fetch e converte via FileReader para evitar
 * que o canvas fique "tainted" (que causaria SecurityError em toDataURL).
 */
async function resolvePhotoUrl(photoUrl: string): Promise<string> {
  if (!photoUrl) throw new Error('empty');
  if (photoUrl.startsWith('data:')) return photoUrl; // já é base64

  // URL HTTPS: fetch → blob → base64 (evita taint do canvas)
  const resp = await fetch(photoUrl, { mode: 'cors' });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const blob = await resp.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror   = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Recorta uma imagem em círculo usando Canvas e retorna data URL PNG.
 * Garante que jsPDF exiba a foto redonda sem bordas quadradas visíveis.
 * Sempre opera sobre uma data URL (não HTTPS) para evitar taint do canvas.
 */
async function cropToCircle(photoUrl: string): Promise<string> {
  const dataUrl = await resolvePhotoUrl(photoUrl);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const size = Math.min(img.width, img.height);
      const canvas = document.createElement('canvas');
      canvas.width  = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d')!;
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      const offsetX = (img.width  - size) / 2;
      const offsetY = (img.height - size) / 2;
      ctx.drawImage(img, -offsetX, -offsetY, img.width, img.height);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

async function buildQr(code: string): Promise<string | undefined> {
  try {
    return await QRCode.toDataURL(
      validationUrl(code),
      { margin: 0, width: 256 },
    );
  } catch { return undefined; }
}

function cleanUserName(name: string): string {
  return name.replace(/\s*(MASTER|PRO|FREE|PREMIUM|INSTITUTIONAL)\s*/gi, '').trim() || name;
}

function setCurrentDocumentMeta(params: {
  code: string;
  kind: DocumentCodeKind;
  userName: string;
  school?: SchoolConfig | null;
  generatedAt?: string;
  qrDataUrl?: string;
}) {
  _currentAuditCode = params.code;
  _currentDocKind = params.kind;
  _currentUserName = cleanUserName(params.userName);
  _currentSchool = params.school ?? null;
  _currentGeneratedAt = params.generatedAt ?? new Date().toISOString();
  _currentQrDataUrl = params.qrDataUrl;
}

function codeLabel(kind: DocumentCodeKind = _currentDocKind): string {
  return kind === 'validation' ? 'Código de Validação' : 'Código de Registro';
}

function shortCodeLabel(kind: DocumentCodeKind = _currentDocKind): string {
  return kind === 'validation' ? 'Cód. Validação' : 'Cód. Registro';
}

// ─── RUNNING HEADER (todas as páginas exceto capa) ───────────────────────────
// Logo + Nome da escola / Cidade–Estado  |  Cód. Validação  +  linha separadora
function addRunningHeader(
  doc: any, auditCode: string, school?: SchoolConfig | null,
): number {
  const W  = doc.internal.pageSize.getWidth();
  const s  = school ?? _currentSchool;
  const name     = s?.schoolName?.trim() || 'Sistema IncluiAI';
  const hasQr = _currentDocKind === 'validation' && !!_currentQrDataUrl;
  const qrSz = hasQr ? 8 : 0;
  const rightX = W - MR - (hasQr ? qrSz + 3 : 0);
  const cityLine = [s?.city, s?.state].filter(Boolean).join(' – ');

  // Logo institucional — máx 7 × 7 mm
  let textX = ML;
  if (s?.logoUrl) {
    try {
      const fmt = s.logoUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
      doc.addImage(s.logoUrl, fmt, ML, 1.5, 7, 7);
      textX = ML + 9;
    } catch {}
  }

  // Nome da escola
  doc.setFont(_docFont, 'bold');
  doc.setFontSize(SMALL_SIZE);
  sc(doc, DARK);
  doc.text(name, textX, 6);

  // Município – Estado (linha secundária, se disponível)
  if (cityLine) {
    doc.setFont(_docFont, 'normal');
    doc.setFontSize(TINY_SIZE);
    sc(doc, GRAY);
    doc.text(cityLine, textX, 9.5);
  }

  // Código de validação (direita)
  doc.setFont('courier', 'normal');
  doc.setFontSize(6.3);
  sc(doc, GRAY);
  doc.text(`${shortCodeLabel()}: ${auditCode}`, rightX, 4.5, { align: 'right' });
  doc.setFont(_docFont, 'normal');
  doc.setFontSize(5.8);
  doc.text(`Gerado em: ${formatGeneratedAt(_currentGeneratedAt)}`, rightX, 7.4, { align: 'right' });
  doc.text(`Gerado por: ${_currentUserName || 'Sistema'}`, rightX, 10.1, { align: 'right' });

  if (hasQr) {
    try { doc.addImage(_currentQrDataUrl, 'PNG', W - MR - qrSz, 2.2, qrSz, qrSz); } catch {}
  }

  // Linha separadora
  sd(doc, BORDER);
  doc.setLineWidth(0.3);
  doc.line(ML, 11, W - MR, 11);

  return RUN_HDR_H; // 12 mm
}

// ─── COVER BLOCK (página 1 — padrão Visual Law institucional) ────────────────
// Estrutura:
//  [BANNER PETROL 46 mm]
//   Logo | Nome da Escola / Secretaria / Município–Estado   | QR Code
//   ─── linha ouro fina ───────────────────────────────────────────────
//   TÍTULO DO DOCUMENTO (destaque)
//   Subtítulo / EDUCAÇÃO INCLUSIVA
//   Código de validação (direita)
//  [LINHA OURO 1,5 mm]
//  Emissão  |  Cód. Validação  |  URL
//  ─── linha separadora ───
function addCoverBlock(
  doc: any,
  title: string,
  subtitle: string | null,
  auditCode: string,
  qrUrl: string | undefined,
  schoolName: string,
): number {
  const W      = doc.internal.pageSize.getWidth();
  const maxW   = W - ML - MR;
  const school = _currentSchool;
  const isValidation = _currentDocKind === 'validation';

  const cityLine = [school?.city, school?.state].filter(Boolean).join(' – ');
  const secLine  = (school as any)?.secretaria as string | undefined;

  const bannerH = 46;

  // ── BANNER PETROL ─────────────────────────────────────────────────────────────
  sf(doc, PETROL);
  doc.rect(0, 0, W, bannerH, 'F');

  // ── LINHA OURO (base do banner) ───────────────────────────────────────────────
  sf(doc, GOLD);
  doc.rect(0, bannerH, W, 1.5, 'F');

  // ── QR CODE (canto superior direito, fundo branco) ────────────────────────────
  const qrSz = 20;
  const qrX  = W - MR - qrSz;
  if (qrUrl) {
    try {
      sf(doc, WHITE);
      doc.roundedRect(qrX - 2, 2, qrSz + 4, qrSz + 4, 1.5, 1.5, 'F');
      doc.addImage(qrUrl, 'PNG', qrX, 3, qrSz, qrSz);
    } catch {}
  }

  // ── LOGO (esquerda) ───────────────────────────────────────────────────────────
  let textX = ML;
  if (school?.logoUrl) {
    try {
      const fmt = school.logoUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
      doc.addImage(school.logoUrl, fmt, ML, 2, 9, 9);
      textX = ML + 11;
    } catch {}
  }

  // ── BLOCO IDENTIDADE DA ESCOLA (topo esquerdo) ────────────────────────────────
  const idAreaW = qrX - textX - 4;
  doc.setFont(_docFont, 'bold');
  doc.setFontSize(9.5);
  sc(doc, WHITE);
  const snLines: string[] = doc.splitTextToSize(schoolName.toUpperCase(), idAreaW);
  doc.text(snLines, textX, 8);
  let infoY = 8 + snLines.length * 4.2;

  if (secLine) {
    doc.setFont(_docFont, 'normal');
    doc.setFontSize(7.5);
    sc(doc, [200, 225, 235] as [number, number, number]);
    doc.text(secLine, textX, infoY);
    infoY += 4;
  }
  if (cityLine) {
    doc.setFont(_docFont, 'normal');
    doc.setFontSize(7.5);
    sc(doc, [175, 210, 228] as [number, number, number]);
    doc.text(cityLine, textX, infoY);
  }

  // ── LINHA OURO FINA (divisória dentro do banner) ──────────────────────────────
  sf(doc, GOLD);
  doc.rect(ML, 17, maxW, 0.3, 'F');

  // ── TÍTULO DO DOCUMENTO (centro do banner) ────────────────────────────────────
  const titleAreaW = qrUrl ? qrX - ML - 4 : maxW;
  doc.setFont(_docFont, 'bold');
  doc.setFontSize(14);
  sc(doc, WHITE);
  const tLines: string[] = doc.splitTextToSize(title, titleAreaW);
  doc.text(tLines, ML, 25);
  const afterTitleY = 25 + tLines.length * 5.8;

  // ── SUBTÍTULO / EDUCAÇÃO INCLUSIVA ────────────────────────────────────────────
  const eduLabel = subtitle || 'EDUCAÇÃO INCLUSIVA';
  doc.setFont(_docFont, 'normal');
  doc.setFontSize(8);
  sc(doc, [175, 215, 232] as [number, number, number]);
  const subLines: string[] = doc.splitTextToSize(eduLabel, titleAreaW);
  const subY = Math.min(afterTitleY, bannerH - 7);
  doc.text(subLines, ML, subY);

  // ── CÓDIGO DE VALIDAÇÃO (abaixo do QR) ───────────────────────────────────────
  if (qrUrl) {
    doc.setFont('courier', 'bold');
    doc.setFontSize(6.5);
    sc(doc, GOLD);
    doc.text(auditCode, W - MR, 26, { align: 'right' });
    doc.setFont(_docFont, 'normal');
    doc.setFontSize(6);
    sc(doc, [175, 210, 225] as [number, number, number]);
    doc.text('Validar: incluiai.app.br', W - MR, 30, { align: 'right' });
  }

  // ── LINHA DE METADADOS (abaixo do banner) ─────────────────────────────────────
  const metaY   = bannerH + 8;
  const nowStr  = formatGeneratedAt(_currentGeneratedAt);

  doc.setFont(_docFont, 'normal');
  doc.setFontSize(TINY_SIZE);
  sc(doc, GRAY);
  doc.text(`Gerado em: ${nowStr}`, ML, metaY);
  doc.text(`Gerado por: ${_currentUserName || 'Sistema'}`, ML, metaY + 4);

  // Código centralizado
  doc.setFont(_docFont, 'bold');
  doc.setFontSize(SMALL_SIZE);
  sc(doc, PETROL);
  const cLabel  = `${shortCodeLabel()}: `;
  const cLabelW = doc.getTextWidth(cLabel);
  const codeW   = doc.getTextWidth(auditCode);
  const codeX   = W / 2 - (cLabelW + codeW) / 2;
  doc.text(cLabel, codeX, metaY);
  doc.setFont('courier', 'bold');
  doc.text(auditCode, codeX + cLabelW, metaY);

  doc.setFont(_docFont, 'normal');
  doc.setFontSize(TINY_SIZE);
  sc(doc, GRAY);
  doc.text(isValidation ? 'incluiai.app.br/validar' : INCLUIAI_SITE, W - MR, metaY, { align: 'right' });

  sd(doc, BORDER);
  doc.setLineWidth(0.3);
  doc.line(ML, metaY + 8, W - MR, metaY + 8);

  return metaY + 14;
}

// ─── SECTION BANNER (faixa petrol full-width — SECTION_SIZE 11 pt) ──────────
function sectionBanner(
  doc: any, text: string, x: number, y: number, w: number,
): number {
  const h = 8;
  sf(doc, PETROL);
  doc.roundedRect(x, y, w, h, 1, 1, 'F');
  
  doc.setFont(_docFont,'bold');
  doc.setFontSize(SECTION_SIZE);
  sc(doc, WHITE);
  doc.text(text.toUpperCase(), x + 4, y + 5.5);
  return y + h + 6;
}

// ─── SUB-SECTION TITLE (petrol bold text, numbered) ──────────────────────────
let _subN = 0;
const resetSubN = () => { _subN = 0; };

function subSection(
  doc: any, text: string, x: number, y: number, numOverride?: string,
): number {
  const n = numOverride ?? String(++_subN);
  doc.setFont(_docFont,'bold');
  doc.setFontSize(LABEL_SIZE);
  sc(doc, PETROL);
  doc.text(`${n}. ${text}`, x, y);
  return y + 6.5;
}

// ─── STUDENT AVATAR CIRCLE ────────────────────────────────────────────────────
function drawAvatar(doc: any, name: string, cx: number, cy: number, r: number): void {
  sf(doc, PETROL);
  sd(doc, PETROL);
  doc.circle(cx, cy, r, 'F');
  doc.setFont(_docFont,'bold');
  doc.setFontSize(r * 1.3);
  sc(doc, WHITE);
  doc.text(getInitials(name), cx, cy + r * 0.35, { align: 'center' });
}

// ─── DRAW STUDENT PHOTO OR AVATAR ────────────────────────────────────────────
// Se circularDataUrl disponível: renderiza foto já recortada em círculo pelo canvas.
// O crop é feito antes desta chamada via cropToCircle(). Senão: avatar com iniciais.
function drawStudentPhoto(doc: any, name: string, circularDataUrl: string | undefined, cx: number, cy: number, r: number): void {
  if (circularDataUrl) {
    try {
      const imgX = cx - r;
      const imgY = cy - r;
      const size = r * 2;
      // Borda petrol
      sf(doc, PETROL);
      sd(doc, PETROL);
      doc.circle(cx, cy, r + 0.5, 'F');
      // Imagem já recortada em círculo pelo canvas — PNG com fundo transparente
      doc.addImage(circularDataUrl, 'PNG', imgX, imgY, size, size, undefined, 'FAST');
      return;
    } catch { /* falha → usa avatar com iniciais */ }
  }
  drawAvatar(doc, name, cx, cy, r);
}

// ─── KEY-VALUE PAIRS IN 2-COL CARD ───────────────────────────────────────────
function kvGrid(
  doc: any,
  pairs: Array<[string, string]>,
  x: number, y: number, maxW: number,
): number {
  // Remove pares com valor vazio ou "—" para não poluir o documento
  const filtered = pairs.filter(([, v]) => {
    const s = String(v ?? '').trim();
    return s !== '' && s !== '—' && s !== '-';
  });
  if (!filtered.length) return y;
  // eslint-disable-next-line no-param-reassign
  pairs = filtered;

  const colW = (maxW - 10) / 2;
  const rows = Math.ceil(pairs.length / 2);
  const rowH = LINE_H + 2.5;
  const padding = 4;
  const boxH = rows * rowH + padding * 2 - 2;

  sf(doc, GBKG);
  sd(doc, BORDER);
  doc.setLineWidth(0.2);
  doc.roundedRect(x, y, maxW, boxH, 2, 2, 'FD');

  doc.setFontSize(TABLE_SIZE);
  
  pairs.forEach(([k, v], i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const cx  = x + padding + col * (colW + 5);
    const cy  = y + padding + 4.5 + row * rowH;
    
    doc.setFont(_docFont,'bold');
    sc(doc, PETROL);
    doc.text(`${k}`, cx, cy);
    
    const kw = doc.getTextWidth(`${k}`);
    doc.setFont(_docFont,'normal');
    sc(doc, DARK);
    const textV = String(v || '—');
    const safeV = doc.splitTextToSize(textV, colW - kw - 2)[0] || '';
    doc.text(` ${safeV}`, cx + kw, cy);
  });
  
  return y + boxH + 5;
}

// ─── STUDENT IDENTIFICATION BLOCK ────────────────────────────────────────────
// Layout padrão para todos os documentos:
//  [ grade petrol "I. Identificação do Aluno" ]
//  [ kvGrid com dados (esquerda)   |   foto circular (DIREITA 22×22 mm) ]
//
// • photo on right (fixed 22 mm diameter)
// • kvGrid fills remaining left width
// • skips empty fields automatically
// • returns y position after the block
function buildStudentBlock(
  doc: any,
  student: Student,
  circularPhoto: string | undefined,
  x: number, y: number, maxW: number,
  extra?: Array<[string, string]>,
): number {
  const photoD = 22;
  const photoX = x + maxW - photoD;
  const photoY = y;
  const dataW  = maxW - photoD - 5; // largura do grid (esquerda)

  // ── Campos do aluno — ignorar vazios ─────────────────────────────────────────
  const age         = calcAge(student.birthDate);
  const rawGender   = (student as any).gender || (student as any).sex || '';
  const gLabel      = rawGender === 'M' ? 'Masculino'
                    : rawGender === 'F' ? 'Feminino'
                    : rawGender;
  const supportLvl  = (student as any).supportLevel || (student as any).support_level || '';
  const medication  = (student as any).medication || '';
  const shift       = student.shift || (student as any).turno || '';
  const uniqueCode  = (student as any).unique_code || (student.id?.slice(-8) ?? '');
  const schoolLabel = _currentSchool?.schoolName || (student as any).schoolName || '';
  const diagStr     = (student.diagnosis || []).join(', ');

  const pairs: Array<[string, string]> = ([
    ['Nome Completo:',    student.name            ],
    ['Data de Nasc.:',   formatBirthDate(student.birthDate)],
    ['Idade:',           age                      ],
    ['Sexo:',            gLabel                   ],
    ['Série / Turma:',   student.grade || ''      ],
    ['Turno:',           shift                    ],
    ['Escola:',          schoolLabel              ],
    ['Nível de Suporte:', supportLvl              ],
    ['CID / Diagnóstico:', diagStr                ],
    ['Medicação:',       medication               ],
    ['Código Único:',    uniqueCode               ],
    ...(extra ?? []),
  ] as Array<[string, string]>).filter(([, v]) => !!String(v ?? '').trim());

  const gridEndY = kvGrid(doc, pairs, x, y, dataW);

  // ── Foto à DIREITA ────────────────────────────────────────────────────────────
  const cx = photoX + photoD / 2;
  const cy = photoY + photoD / 2;
  const r  = photoD / 2;
  drawStudentPhoto(doc, student.name, circularPhoto, cx, cy, r);

  // Legenda abaixo da foto
  doc.setFont(_docFont, 'normal');
  doc.setFontSize(TINY_SIZE);
  sc(doc, GRAY);
  doc.text('Foto', cx, photoY + photoD + 3.5, { align: 'center' });

  return Math.max(gridEndY, photoY + photoD + 7);
}

// ─── FIELD RENDERER ──────────────────────────────────────────────────────────
function renderField(
  doc: any, label: string, value: string,
  x: number, y: number, maxW: number,
  onNewPage: () => number,
): number {
  const H = doc.internal.pageSize.getHeight();
  if (y > cBot(H) - 15) { y = onNewPage(); }

  if (label) {
    doc.setFont(_docFont,'bold');
    doc.setFontSize(LABEL_SIZE);
    sc(doc, PETROL);
    doc.text(label.toUpperCase(), x, y);
    y += 5;
  }

  doc.setFont(_docFont,'normal');
  doc.setFontSize(BODY_SIZE);
  sc(doc, DARK);
  
  const lineSpacing = LINE_H + 0.5;
  const lines = doc.splitTextToSize(value || '—', maxW);
  for (const ln of lines) {
    if (y > cBot(H) - 6) { y = onNewPage(); }
    doc.text(ln, x, y);
    y += lineSpacing;
  }
  return y + 4;
}

// ─── TABLE RENDERER ──────────────────────────────────────────────────────────
function renderTable(
  doc: any,
  headers: string[],
  colWidths: number[],
  rows: string[][],
  x: number, y: number,
  onNewPage: () => number,
): number {
  const H    = doc.internal.pageSize.getHeight();
  const totW = colWidths.reduce((a, b) => a + b, 0);

  if (y > cBot(H) - 14) { y = onNewPage(); }

  // Header row — faixa petrol, TABLE_SIZE bold
  sf(doc, PETROL);
  doc.roundedRect(x, y, totW, 8, 1, 1, 'F');
  doc.setFont(_docFont,'bold');
  doc.setFontSize(TABLE_SIZE);
  sc(doc, WHITE);
  let cx = x;
  headers.forEach((h, i) => {
    doc.text(h, cx + 4, y + 5.5);
    cx += colWidths[i];
  });
  y += 8;

  rows.forEach((row, ri) => {
    let maxH = 6;
    row.forEach((cell, ci) => {
      const ls = doc.splitTextToSize(cell || '—', (colWidths[ci] ?? 40) - 6);
      maxH = Math.max(maxH, ls.length * 5 + 3);
    });
    if (y + maxH > cBot(H)) { y = onNewPage(); }
    if (ri % 2 === 0) { sf(doc, GBKG); doc.rect(x, y, totW, maxH, 'F'); }
    sd(doc, BORDER); doc.setLineWidth(0.2);
    doc.rect(x, y, totW, maxH, 'D');
    doc.setFont(_docFont,'normal');
    doc.setFontSize(TABLE_SIZE);
    sc(doc, DARK);
    cx = x;
    row.forEach((cell, ci) => {
      const ls = doc.splitTextToSize(cell || '—', (colWidths[ci] ?? 40) - 6);
      doc.text(ls, cx + 4, y + 5);
      cx += colWidths[ci] ?? 40;
    });
    y += maxH;
  });

  return y + 6;
}

// ─── BULLET LIST — LINE_H_LIST (fator 1,27 para listas) ─────────────────────
function renderBullets(
  doc: any, items: string[],
  x: number, y: number, maxW: number,
  onNewPage: () => number,
): number {
  const H = doc.internal.pageSize.getHeight();
  for (const item of items) {
    if (y > cBot(H) - 10) { y = onNewPage(); }
    const bm = item.match(/^\*\*(.+?):\*\*\s*(.*)/s);
    doc.setFontSize(BODY_SIZE);
    sc(doc, DARK);
    if (bm) {
      doc.setFont(_docFont,'normal');
      doc.text('- ', x, y);
      const dw = doc.getTextWidth('- ');
      doc.setFont(_docFont,'bold');
      doc.text(`${bm[1]}: `, x + dw, y);
      const bw = doc.getTextWidth(`${bm[1]}: `);
      doc.setFont(_docFont,'normal');
      const rest = doc.splitTextToSize(bm[2] || '', maxW - dw - bw);
      doc.text(rest[0] ?? '', x + dw + bw, y);
      for (let i = 1; i < rest.length; i++) {
        y += LINE_H_LIST;
        if (y > cBot(H) - 6) { y = onNewPage(); }
        doc.text(rest[i], x + dw, y);
      }
    } else {
      doc.setFont(_docFont,'normal');
      doc.text('- ', x, y);
      const dw = doc.getTextWidth('- ');
      const ls = doc.splitTextToSize(item, maxW - dw);
      doc.text(ls, x + dw, y);
      y += (ls.length - 1) * LINE_H_LIST;
    }
    y += LINE_H_LIST;
  }
  return y + 2;
}

// ─── CHECKLIST RENDERER ──────────────────────────────────────────────────────
function renderChecklist(
  doc: any, sections: DynChecklistSection[],
  x: number, y: number, maxW: number,
  onNewPage: () => number,
): number {
  const H    = doc.internal.pageSize.getHeight();
  const colW = (maxW - 10) / 2; // Increase gutter

  for (const sec of sections) {
    if (y > cBot(H) - 20) { y = onNewPage(); }
    y = sectionBanner(doc, sec.title, x, y, maxW);

    const half = Math.ceil(sec.items.length / 2);
    let lY = y, rY = y;

    sec.items.forEach((item, idx) => {
      const isLeft = idx < half;
      const colX   = isLeft ? x : x + colW + 10;
      let cy       = isLeft ? lY : rY;

      if (cy > cBot(H) - 10) {
        cy = onNewPage();
        if (isLeft) { lY = cy; rY = cy; } else { rY = cy; }
      }

      sf(doc, item.checked ? PETROL : WHITE);
      sd(doc, PETROL);
      doc.setLineWidth(0.3);
      doc.roundedRect(colX, cy - 3.5, 4, 4, 0.5, 0.5, item.checked ? 'FD' : 'D');
      if (item.checked) {
        doc.setFont(_docFont,'bold'); doc.setFontSize(7);
        sc(doc, WHITE); doc.text('✓', colX + 0.6, cy + 0.1);
      }

      const iLs = doc.splitTextToSize(item.text, colW - 6);
      doc.setFont(_docFont,'normal');
      doc.setFontSize(TABLE_SIZE);
      sc(doc, item.checked ? PETROL : DARK);
      doc.text(iLs, colX + 6, cy);
      const adv = Math.max(iLs.length * 4.5, 6) + 3; // +3 for more breathing room
      if (isLeft) lY = cy + adv; else rY = cy + adv;
    });
    y = Math.max(lY, rY) + 6;
  }
  return y;
}

// ─── HIGHLIGHT BOX — borda dourada, fundo âmbar claro ────────────────────────
// Uso: orientações críticas, recomendações de alta prioridade
const AMBER_BG:  [number,number,number] = [255, 251, 235]; // amber-50
const AMBER_TXT: [number,number,number] = [120,  53,  15]; // amber-900

function renderHighlight(
  doc: any, label: string, text: string,
  x: number, y: number, maxW: number,
  onNewPage: () => number,
): number {
  if (!text?.trim()) return y;
  const H     = doc.internal.pageSize.getHeight();
  const inner = maxW - 8;
  const lines = doc.splitTextToSize(text, inner);
  const labelH = label ? 6 : 0;
  const boxH   = lines.length * LINE_H + labelH + 6;

  if (y > cBot(H) - boxH - 4) { y = onNewPage(); }

  sf(doc, AMBER_BG); sd(doc, GOLD); doc.setLineWidth(0.5);
  doc.roundedRect(x, y, maxW, boxH, 2, 2, 'FD');

  let ty = y + 5;
  if (label) {
    doc.setFont(_docFont,'bold'); doc.setFontSize(LABEL_SIZE); sc(doc, AMBER_TXT);
    doc.text(label.toUpperCase(), x + 4, ty);
    ty += labelH;
  }
  doc.setFont(_docFont,'normal'); doc.setFontSize(BODY_SIZE); sc(doc, DARK);
  doc.text(lines, x + 4, ty);
  return y + boxH + 4;
}

// ─── INFO BOX — borda petrol, fundo azul claro ────────────────────────────────
// Uso: informações técnicas importantes, avisos pedagógicos
const INFO_BG: [number,number,number] = [236, 244, 247]; // petrol-50

function renderInfoBox(
  doc: any, label: string, text: string,
  x: number, y: number, maxW: number,
  onNewPage: () => number,
): number {
  if (!text?.trim()) return y;
  const H     = doc.internal.pageSize.getHeight();
  const inner = maxW - 8;
  const lines = doc.splitTextToSize(text, inner);
  const labelH = label ? 6 : 0;
  const boxH   = lines.length * LINE_H + labelH + 6;

  if (y > cBot(H) - boxH - 4) { y = onNewPage(); }

  sf(doc, INFO_BG); sd(doc, PETROL); doc.setLineWidth(0.5);
  doc.roundedRect(x, y, maxW, boxH, 2, 2, 'FD');

  let ty = y + 5;
  if (label) {
    doc.setFont(_docFont,'bold'); doc.setFontSize(LABEL_SIZE); sc(doc, PETROL);
    doc.text(label.toUpperCase(), x + 4, ty);
    ty += labelH;
  }
  doc.setFont(_docFont,'normal'); doc.setFontSize(BODY_SIZE); sc(doc, DARK);
  doc.text(lines, x + 4, ty);
  return y + boxH + 4;
}

// ─── SIGNATURE BLOCK (2×2 grid — reference design) ───────────────────────────
interface SignatureAreaOpts {
  parentSignatureData?: string;
  parentSignatureMode?: 'digital' | 'manual';
  parentSignerName?: string;
}

// Base legal atualizada — inclui Decreto nº 12.686/2025 (nova PNEE)
const LEGAL_MAP: Record<string, string> = {
  PEI:
    'Lei nº 9.394/1996 (LDB) art. 59; Lei nº 13.146/2015 (LBI) art. 28; Resolução CNE/CEB nº 4/2009; Decreto nº 7.611/2011; Decreto nº 12.686/2025 (PNEE).',
  PAEE:
    'Resolução CNE/CEB nº 4/2009 (art. 10–12); Decreto nº 7.611/2011; Lei nº 13.146/2015 (art. 28–29); Nota Técnica DPEE/MEC nº 04/2014; Portaria MEC nº 555/2007; Decreto nº 12.686/2025.',
  PDI:
    'Lei nº 13.146/2015 (LBI) art. 27–28; Resolução CNE/CEB nº 4/2009; Decreto nº 7.611/2011; Decreto nº 12.686/2025 (PNEE).',
  ESTUDO_CASO:
    'Lei nº 9.394/1996 (LDB); Lei nº 13.146/2015 (LBI); Resolução CNE/CEB nº 4/2009; Decreto nº 7.611/2011; Lei nº 14.624/2023; Decreto nº 12.686/2025 (PNEE). Sigilo conforme Lei nº 13.709/2018 (LGPD).',
  checklist_4laudas:
    'Resolução CNE/CEB nº 4/2009; Decreto nº 7.611/2011; Lei nº 13.146/2015 (LBI) art. 28.',
  encaminhamento_redes:
    'Lei nº 13.146/2015 (LBI) art. 14; Lei nº 8.069/1990 (ECA) art. 70; Resolução CNE/CEB nº 4/2009; Decreto nº 7.611/2011.',
  convite_reuniao:
    'Lei nº 9.394/1996 (LDB) art. 12 inc. VI; Lei nº 13.146/2015 (LBI) art. 28 inc. XVII.',
  termo_compromisso_aee:
    'Resolução CNE/CEB nº 4/2009; Decreto nº 7.611/2011; Lei nº 13.146/2015 (LBI) art. 28; Decreto nº 12.686/2025.',
  declaracao_comparecimento:
    'Lei nº 9.394/1996 (LDB) art. 12; Lei nº 8.069/1990 (ECA).',
  termo_desligamento:
    'Resolução CNE/CEB nº 4/2009; Decreto nº 7.611/2011; Lei nº 13.146/2015 (LBI).',
  declaracao_matricula:
    'Resolução CNE/CEB nº 4/2009; Decreto nº 7.611/2011; Lei nº 13.146/2015 (LBI) art. 28; Decreto nº 12.686/2025 (PNEE).',
  DEFAULT:
    'Lei nº 13.146/2015 (LBI); Resolução CNE/CEB nº 4/2009; Decreto nº 7.611/2011; Decreto nº 12.686/2025 (PNEE).',
};

function getDocLegal(docType: string): string {
  return LEGAL_MAP[docType.toUpperCase()] ?? LEGAL_MAP.DEFAULT;
}

function addSignatureBlock(
  doc: any,
  x: number, y: number, maxW: number,
  onNewPage: () => number,
  docType: string,
  auditCode: string,
  userName: string,
  opts?: SignatureAreaOpts,
): number {
  const isValidation = _currentDocKind === 'validation';
  const H    = doc.internal.pageSize.getHeight();
  const need = 85; 
  if (y > cBot(H) - need) { y = onNewPage(); }

  y += 4; 

  doc.setFont(_docFont, 'bold');
  doc.setFontSize(SECTION_SIZE + 1);
  sc(doc, PETROL);
  doc.text(isValidation ? 'Validação e Assinaturas' : 'Registro e Assinaturas', x, y);
  y += 3;
  sd(doc, GOLD);
  doc.setLineWidth(0.5);
  doc.line(x, y, x + 35, y);
  y += 7;

  // Declaration
  const decl =
    'Declaramos, para os devidos fins legais e pedagógicos, ciência e concordância com as informações e diretrizes estabelecidas neste documento.';
  doc.setFont(_docFont,'italic');
  doc.setFontSize(BODY_SIZE - 0.5);
  sc(doc, GRAY);
  const declLs = doc.splitTextToSize(decl, maxW);
  doc.text(declLs, x, y);
  y += declLs.length * LINE_H + 15; 

  const colW     = (maxW - 20) / 2;
  const cleanName = (userName || '').replace(/\s*(MASTER|PRO|FREE|PREMIUM|INSTITUTIONAL)\s*/gi, '').trim() || userName;

  const signers = [
    { role: 'Profissional Responsável', id: 'Matrícula: _______________' },
    { role: 'Professora(o) Regente',    id: 'Matrícula: _______________' },
    { role: 'Coordenação Pedagógica',   id: 'Registro: _______________'  },
    {
      role:    opts?.parentSignerName ?? 'Responsável Legal',
      id:      'CPF: _______________',
      digital: opts?.parentSignatureMode === 'digital' ? opts?.parentSignatureData : undefined,
    },
  ];

  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 2; col++) {
      const si = row * 2 + col;
      const s  = signers[si];
      const sx = x + col * (colW + 20);

      if (s.digital) {
        try { doc.addImage(s.digital, 'PNG', sx + (colW / 2) - 15, y - 10, 30, 15); } catch {}
      }

      sd(doc, DARK);
      doc.setLineWidth(0.2);
      doc.line(sx, y + 10, sx + colW, y + 10);

      if (s.digital && opts?.parentSignatureMode === 'digital') {
        doc.setFont(_docFont,'bold');
        doc.setFontSize(TINY_SIZE);
        sc(doc, PETROL);
        doc.text('✓ Assinado Digitalmente', sx + colW / 2, y + 14, { align: 'center' });
      }

      doc.setFont(_docFont,'bold');
      doc.setFontSize(SMALL_SIZE + 0.5);
      sc(doc, DARK);
      const nameText = si === 0 ? cleanName : ''; 
      doc.text(nameText, sx + colW / 2, y + 15, { align: 'center' });

      doc.setFont(_docFont,'normal');
      doc.setFontSize(SMALL_SIZE);
      sc(doc, GRAY);
      doc.text(s.role, sx + colW / 2, y + 19, { align: 'center' });

      doc.setFontSize(TINY_SIZE + 0.5);
      doc.text(s.id, sx + colW / 2, y + 23, { align: 'center' });
    }
    y += 40; 
  }

  y -= 5;
  
  sd(doc, BORDER);
  doc.setLineWidth(0.3);
  doc.line(x, y, x + maxW, y);
  y += 7;

  const legal = getDocLegal(docType);
  doc.setFont(_docFont,'bold');
  doc.setFontSize(TINY_SIZE);
  sc(doc, PETROL);
  doc.text('BASE LEGAL:', x, y);
  
  doc.setFont(_docFont,'normal');
  sc(doc, GRAY);
  const legalLs = doc.splitTextToSize(legal, maxW);
  doc.text(legalLs, x, y + 4);
  y += legalLs.length * 3.5 + 4;

  const auditDate = new Date().toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
  
  doc.setFont('courier', 'normal');
  doc.setFontSize(TINY_SIZE);
  sc(doc, DARK);
  doc.text(`Documento gerado em ${auditDate} por ${cleanName}`, x, y);
  doc.text(isValidation ? `Valide este documento em: ${INCLUIAI_SITE}/validar` : `Registro interno: ${INCLUIAI_SITE}`, x, y + 4);
  
  doc.setFont('courier', 'bold');
  doc.text(`${codeLabel().toUpperCase()}: ${auditCode}`, x + maxW, y + 4, { align: 'right' });

  return y + 10;
}

// ─── FOOTER (todas as páginas) ───────────────────────────────────────────────
// Linha 1: tag institucional  |  marca  |  número de página
// Linha 2: emitente + data    |  URL de validação com código
function addFooter(doc: any): void {
  const W   = doc.internal.pageSize.getWidth();
  const H   = doc.internal.pageSize.getHeight();
  const fY  = H - MB - FOOTER_H + 2;
  const pgN = doc.internal.getCurrentPageInfo().pageNumber;
  const isValidation = _currentDocKind === 'validation';
  const qrSz = isValidation && _currentQrDataUrl ? 10 : 0;
  const textRight = W - MR - (qrSz ? qrSz + 3 : 0);
  const footerCodeLabel = codeLabel();

  // Dupla linha decorativa petrol + ouro
  sf(doc, PETROL);
  doc.rect(ML, fY, W - ML - MR, 0.5, 'F');
  sf(doc, GOLD);
  doc.rect(ML, fY + 0.5, W - ML - MR, 0.2, 'F');

  // ── Linha 1 ──────────────────────────────────────────────────────────────────
  doc.setFont(_docFont, 'normal');
  doc.setFontSize(TINY_SIZE);
  sc(doc, GRAY);
  doc.text(`IncluiAI - ${INCLUIAI_SITE} - ${footerCodeLabel} ${_currentAuditCode}`, ML, fY + 4.5);

  doc.setFont(_docFont, 'bold');
  sc(doc, PETROL);
  doc.text(isValidation ? 'DOCUMENTO VALIDADO' : 'DOCUMENTO REGISTRADO', W / 2, fY + 4.5, { align: 'center' });

  doc.setFont(_docFont, 'normal');
  sc(doc, GRAY);
  doc.text(`Página ${pgN}`, textRight, fY + 4.5, { align: 'right' });

  // ── Linha 2 ──────────────────────────────────────────────────────────────────
  doc.setFont(_docFont, 'normal');
  doc.setFontSize(TINY_SIZE - 0.5);
  sc(doc, GRAY);

  const cleanName = _currentUserName || '';
  if (cleanName) {
    doc.text(`Gerado por: ${cleanName}  |  ${formatGeneratedAt(_currentGeneratedAt)}`, ML, fY + 8.5);
  }

  if (_currentAuditCode) {
    doc.setFont('courier', 'normal');
    doc.setFontSize(TINY_SIZE - 0.5);
    sc(doc, PETROL);
    doc.text(`${footerCodeLabel}: ${_currentAuditCode}`, textRight, fY + 8.5, { align: 'right' });
  }

  if (isValidation && _currentQrDataUrl) {
    try { doc.addImage(_currentQrDataUrl, 'PNG', W - MR - qrSz, fY + 2.1, qrSz, qrSz); } catch {}
  }
}

function addFooterAllPages(doc: any): void {
  const n = doc.internal.getNumberOfPages();
  for (let i = 1; i <= n; i++) { doc.setPage(i); addFooter(doc); }
}

// ─── MAIN API ────────────────────────────────────────────────────────────────
export interface GeneratePDFParams {
  docType:  string;
  title?:   string;
  student:  Student;
  user:     User;
  school?:  SchoolConfig | null;
  filledData:         Record<string, string>;
  checklistSections?: DynChecklistSection[];
  auditCode:          string;
  parentSignatureData?: string;
  parentSignatureMode?: 'digital' | 'manual';
  parentSignerName?:    string;
}

export const PDFGenerator = {

  async generate(params: GeneratePDFParams): Promise<Blob> {
    resetSubN();
    const docKind = getDocumentCodeKind(params.docType);
    const documentCode = ensureDocumentCode(docKind, params.auditCode);
    // Metadados acessíveis pelo rodapé/cabeçalho via vars de módulo
    setCurrentDocumentMeta({
      code: documentCode,
      kind: docKind,
      userName: params.user.name,
      school: params.school ?? null,
    });

    const {
      docType, title, student, user, school,
      filledData, checklistSections = [],
      parentSignatureData, parentSignatureMode, parentSignerName,
    } = params;
    const auditCode = documentCode;

    const sigOpts: SignatureAreaOpts = { parentSignatureData, parentSignatureMode, parentSignerName };

    const jsPDF    = await loadJsPDF();
    const doc      = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    await ensureNotoSans(doc);
    const W        = doc.internal.pageSize.getWidth();
    const maxW     = W - ML - MR;
    const qrUrl    = docKind === 'validation' ? await buildQr(auditCode) : undefined;
    _currentQrDataUrl = qrUrl;
    const docTitle = title || getDocTitle(docType);
    const dateStr  = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
    const sName    = school?.schoolName || 'Escola';
    const halfW    = (maxW - 4) / 2;
    const subtitle = getDocSubtitle(docType);

    // Pré-processa foto em círculo via Canvas (antes do jsPDF — único método confiável)
    const circularPhoto = student.photoUrl ? await cropToCircle(student.photoUrl).catch(() => undefined) : undefined;

    // Page 1: cover block only
    let y = addCoverBlock(doc, docTitle, subtitle, auditCode, qrUrl, sName);

    // Pages 2+: running header only
    const newPage = (): number => {
      doc.addPage();
      return addRunningHeader(doc, auditCode, school);
    };

    // ══ SEÇÃO I: IDENTIFICAÇÃO DO ALUNO (padrão todos os documentos) ════════
    y = sectionBanner(doc, 'I. Identificação do Aluno', ML, y, maxW);
    y = buildStudentBlock(doc, student, circularPhoto, ML, y, maxW);

    switch (docType) {

      // ══ CHECKLIST DE OBSERVAÇÃO ═══════════════════════════════════════════
      case 'checklist_4laudas': {
        // II. Dados Técnicos
        y = sectionBanner(doc, 'II. Dados Técnicos do Atendimento', ML, y, maxW);
        y = kvGrid(doc, [
          ['Data do Atendimento:', filledData.data || dateStr],
          ['Profissional Responsável:', user.name],
        ], ML, y, maxW);
        y += 3;

        // III. Checklist 2 colunas
        if (checklistSections.length > 0) {
          y = sectionBanner(doc, 'III. Checklist de Observação', ML, y, maxW);
          y = renderChecklist(doc, checklistSections, ML, y, maxW, newPage);
        }

        // IV. Análise e Observações
        if (filledData.observacoes) {
          const H = doc.internal.pageSize.getHeight();
          if (y > cBot(H) - 15) { y = newPage(); }
          y = sectionBanner(doc, 'IV. Análise e Observações Complementares', ML, y, maxW);
          y = renderInfoBox(doc, 'Análise Pedagógica', filledData.observacoes, ML, y, maxW, newPage);
        }

        // V. Validação
        y = addSignatureBlock(doc, ML, y, maxW, newPage, docType, auditCode, user.name, sigOpts);
        break;
      }

      // ══ ENCAMINHAMENTO ════════════════════════════════════════════════════
      case 'encaminhamento_redes': {
        // II. Dados do Encaminhamento
        y = sectionBanner(doc, 'II. Identificação do Encaminhamento', ML, y, maxW);
        y = kvGrid(doc, [
          ['Responsável Legal:', filledData.responsavel || '—'],
          ['Data:', filledData.data || dateStr],
          ['Setor / Serviço:', `${filledData.setor || '—'}${filledData.servico ? ' — ' + filledData.servico : ''}`],
          ['Motivo:', filledData.motivo_opcao || '—'],
        ], ML, y, maxW);
        y += 2;

        // III. Justificativa
        if (filledData.motivo) {
          y = sectionBanner(doc, 'III. Justificativa do Encaminhamento', ML, y, maxW);
          y = renderField(doc, 'Detalhamento', filledData.motivo, ML, y, maxW, newPage);
        }

        // IV. Orientações ao Serviço Receptor
        if (filledData.observacoes) {
          y = sectionBanner(doc, 'IV. Orientações ao Serviço Receptor', ML, y, maxW);
          y = renderHighlight(doc, 'Orientações Técnicas ao Serviço de Referência', filledData.observacoes, ML, y, maxW, newPage);
        }

        // Texto formal de encaminhamento
        const intro = `A ${sName} encaminha o(a) aluno(a) ${student.name} para atendimento especializado na rede de apoio indicada, conforme necessidade pedagógica e de saúde observada pela equipe escolar. Solicitamos atenção às orientações técnicas acima registradas.`;
        doc.setFont(_docFont,'italic'); doc.setFontSize(SMALL_SIZE); sc(doc, GRAY);
        const iLs = doc.splitTextToSize(intro, maxW);
        if (y > cBot(doc.internal.pageSize.getHeight()) - iLs.length * LINE_H - 10) { y = newPage(); }
        doc.text(iLs, ML, y);
        y += iLs.length * LINE_H + 4;

        // V. Validação
        y = addSignatureBlock(doc, ML, y, maxW, newPage, docType, auditCode, user.name, sigOpts);
        break;
      }

      // ══ CONVITE PARA REUNIÃO ══════════════════════════════════════════════
      case 'convite_reuniao': {
        // II. Dados da Convocação
        y = sectionBanner(doc, 'II. Dados da Convocação', ML, y, maxW);
        y = kvGrid(doc, [
          ['Data e Horário:', filledData.data_horario || '—'],
          ['Local:', filledData.local || sName],
          ['Responsável:', filledData.profissional || user.name],
          ['Escola:', sName],
        ], ML, y, maxW);
        y += 2;

        // III. Pauta e Objetivo
        y = sectionBanner(doc, 'III. Pauta e Objetivo da Reunião', ML, y, maxW);
        y = renderField(doc, 'Pauta / Assunto', filledData.pauta || 'Acompanhamento pedagógico do(a) aluno(a)', ML, y, maxW, newPage);

        if (school?.contact) {
          doc.setFont(_docFont,'italic'); doc.setFontSize(SMALL_SIZE); sc(doc, GRAY);
          const H = doc.internal.pageSize.getHeight();
          if (y > cBot(H) - 10) { y = newPage(); }
          doc.text(`Em caso de impossibilidade, entre em contato: ${school.contact}`, ML, y);
          y += LINE_H + 4;
        }

        // IV. Validação
        y = addSignatureBlock(doc, ML, y, maxW, newPage, docType, auditCode, user.name, sigOpts);
        break;
      }

      // ══ TERMO DE COMPROMISSO AEE ══════════════════════════════════════════
      case 'termo_compromisso_aee': {
        // II. Termos e Compromissos
        y = sectionBanner(doc, 'II. Termos e Compromissos Assumidos', ML, y, maxW);
        y = subSection(doc, 'O(a) responsável legal compromete-se a:', ML, y);

        const items = [
          'Garantir a participação regular do(a) aluno(a) nos atendimentos agendados no AEE;',
          'Informar à equipe escolar sobre ausências ou impossibilidades com antecedência mínima de 24 horas;',
          'Colaborar com as orientações fornecidas pela equipe de AEE e aplicar estratégias em ambiente domiciliar;',
          'Autorizar o uso de materiais adaptados, tecnologias assistivas e recursos de acessibilidade quando indicados;',
          'Participar das reuniões de acompanhamento, avaliação e revisão do Plano de AEE convocadas pela escola.',
        ];
        y = renderBullets(doc, items, ML, y, maxW, newPage);
        y += 3;

        // III. Dados da Formalização
        y = sectionBanner(doc, 'III. Dados da Formalização', ML, y, maxW);
        y = kvGrid(doc, [
          ['Início no AEE:', filledData.data_inicio || '—'],
          ['Data de Assinatura:', filledData.data || dateStr],
        ], ML, y, maxW);

        // IV. Validação
        y = addSignatureBlock(doc, ML, y, maxW, newPage, docType, auditCode, user.name, sigOpts);
        break;
      }

      // ══ DECLARAÇÃO DE COMPARECIMENTO ══════════════════════════════════════
      case 'declaracao_comparecimento': {
        // II. Objeto da Declaração
        y = sectionBanner(doc, 'II. Objeto da Declaração', ML, y, maxW);
        const body = `Declaro, para os devidos fins, que o(a) Sr.(a) ${filledData.responsavel || '_______________'}, responsável legal pelo(a) aluno(a) ${student.name}, compareceu a esta instituição na data de ${filledData.data || dateStr}, no horário de ${filledData.horario || '___:___'}, para ${filledData.motivo || '_______________'}.`;
        doc.setFont(_docFont,'normal'); doc.setFontSize(BODY_SIZE); sc(doc, DARK);
        const bLs = doc.splitTextToSize(body, maxW);
        doc.text(bLs, ML, y);
        y += bLs.length * LINE_H + 4;

        // III. Dados Institucionais
        y = sectionBanner(doc, 'III. Dados Institucionais', ML, y, maxW);
        y = kvGrid(doc, [
          ['Instituição:', sName],
          ['Data de Emissão:', filledData.data || dateStr],
        ], ML, y, maxW);

        doc.setFont(_docFont,'italic'); doc.setFontSize(SMALL_SIZE); sc(doc, GRAY);
        const H = doc.internal.pageSize.getHeight();
        if (y > cBot(H) - 8) { y = newPage(); }
        doc.text('Esta declaração é fornecida a pedido do(a) interessado(a) para os fins que se fizerem necessários.', ML, y);
        y += LINE_H + 4;

        // IV. Validação
        y = addSignatureBlock(doc, ML, y, maxW, newPage, docType, auditCode, user.name, sigOpts);
        break;
      }

      // ══ TERMO DE DESLIGAMENTO ══════════════════════════════════════════════
      case 'termo_desligamento': {
        // II. Período de Atendimento
        y = sectionBanner(doc, 'II. Dados do Período de Atendimento', ML, y, maxW);
        y = kvGrid(doc, [
          ['Primeiro Atendimento:', filledData.primeiro_dia_atendimento || '—'],
          ['Último Atendimento:',   filledData.ultimo_dia_atendimento || '—'],
          ['Motivo do Desligamento:', filledData.motivo_opcao || '—'],
          ['Instituição:', sName],
        ], ML, y, maxW);

        if (filledData.motivo_complemento) {
          y = renderField(doc, 'Detalhamento do Motivo', filledData.motivo_complemento, ML, y, maxW, newPage);
        }

        // III. Síntese da Evolução Pedagógica
        if (filledData.evolucao) {
          y = sectionBanner(doc, 'III. Síntese da Evolução Pedagógica', ML, y, maxW);
          y = renderField(doc, '', filledData.evolucao, ML, y, maxW, newPage);
        }

        // IV. Recomendações Finais
        if (filledData.recomendacoes) {
          y = sectionBanner(doc, 'IV. Recomendações Finais', ML, y, maxW);
          y = renderHighlight(doc, 'Recomendações para Continuidade do Processo', filledData.recomendacoes, ML, y, maxW, newPage);
        }

        y = kvGrid(doc, [['Data de Emissão:', filledData.data || dateStr]], ML, y, maxW);

        // V. Validação
        y = addSignatureBlock(doc, ML, y, maxW, newPage, docType, auditCode, user.name, sigOpts);
        break;
      }

      // ══ DECLARAÇÃO DE MATRÍCULA AEE ═══════════════════════════════════════
      case 'declaracao_matricula': {
        // II. Dados da Matrícula
        y = sectionBanner(doc, 'II. Dados da Matrícula AEE', ML, y, maxW);
        y = kvGrid(doc, [
          ['Data da Matrícula AEE:', filledData.data_matricula || '—'],
          ['Turno do AEE:',          filledData.turno_aee || '—'],
          ['NEE / Diagnóstico:',     (student.diagnosis || []).join(', ') || '—'],
          ['Instituição:',           sName],
        ], ML, y, maxW);
        y += 2;

        // III. Declaração Oficial
        y = sectionBanner(doc, 'III. Declaração Oficial', ML, y, maxW);
        const body2 = `Declaramos, para os devidos fins legais e pedagógicos, que o(a) aluno(a) ${student.name} está regularmente matriculado(a) na Sala de Recursos Multifuncionais (SRM / AEE) desta instituição, em conformidade com a Resolução CNE/CEB nº 4/2009, o Decreto nº 7.611/2011 e o Art. 28 da Lei nº 13.146/2015 (LBI).`;
        doc.setFont(_docFont,'normal'); doc.setFontSize(BODY_SIZE); sc(doc, DARK);
        const b2Ls = doc.splitTextToSize(body2, maxW);
        const H2 = doc.internal.pageSize.getHeight();
        if (y > cBot(H2) - b2Ls.length * LINE_H - 10) { y = newPage(); }
        doc.text(b2Ls, ML, y);
        y += b2Ls.length * LINE_H + 5;

        doc.setFont(_docFont,'italic'); doc.setFontSize(SMALL_SIZE); sc(doc, GRAY);
        doc.text(`Declaração emitida em ${dateStr} pela Coordenação do AEE de ${sName}.`, ML, y);
        y += LINE_H + 4;

        // IV. Validação
        y = addSignatureBlock(doc, ML, y, maxW, newPage, docType, auditCode, user.name, sigOpts);
        break;
      }

      // ══ GENÉRICO ══════════════════════════════════════════════════════════
      default: {
        const entries = Object.entries(filledData).filter(([, v]) => !!v);
        if (entries.length > 0) {
          y = sectionBanner(doc, 'II. Conteúdo do Documento', ML, y, maxW);
          for (const [key, val] of entries) {
            const label = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            y = renderField(doc, label, val, ML, y, maxW, newPage);
          }
        }
        y = addSignatureBlock(doc, ML, y, maxW, newPage, docType, auditCode, user.name, sigOpts);
        break;
      }
    }

    addFooterAllPages(doc);
    return doc.output('blob') as Blob;
  },

  // ── Seções livres (PEI / PAEE / PDI / Estudo de Caso — DocumentBuilder) ──────
  async generateFromSections(params: {
    docType:  string;
    title?:   string;
    student:  Student;
    user:     User;
    school?:  SchoolConfig | null;
    sections: Array<{
      title:  string;
      fields: Array<{ label: string; value: any; type?: string; maxScale?: number }>;
    }>;
    auditCode:            string;
    parentSignatureData?: string;
    parentSignatureMode?: 'digital' | 'manual';
    parentSignerName?:    string;
  }): Promise<Blob> {
    resetSubN();
    const docKind = getDocumentCodeKind(params.docType);
    const documentCode = ensureDocumentCode(docKind, params.auditCode);
    setCurrentDocumentMeta({
      code: documentCode,
      kind: docKind,
      userName: params.user.name,
      school: params.school ?? null,
    });

    const {
      docType, title, student, user, school,
      sections,
      parentSignatureData, parentSignatureMode, parentSignerName,
    } = params;
    const auditCode = documentCode;

    const sigOpts: SignatureAreaOpts = { parentSignatureData, parentSignatureMode, parentSignerName };

    const jsPDF    = await loadJsPDF();
    const doc      = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    await ensureNotoSans(doc);
    const W        = doc.internal.pageSize.getWidth();
    const maxW     = W - ML - MR;
    const qrUrl    = docKind === 'validation' ? await buildQr(auditCode) : undefined;
    _currentQrDataUrl = qrUrl;
    const docTitle = title || getDocTitle(docType);
    const subtitle = getDocSubtitle(docType);
    const sName    = school?.schoolName || 'Escola';

    // Pré-processa foto em círculo via Canvas
    const circularPhoto = student.photoUrl ? await cropToCircle(student.photoUrl).catch(() => undefined) : undefined;

    let y = addCoverBlock(doc, docTitle, subtitle, auditCode, qrUrl, sName);

    const newPage = (): number => {
      doc.addPage();
      return addRunningHeader(doc, auditCode, school);
    };

    // ══ SEÇÃO I: IDENTIFICAÇÃO DO ALUNO (padrão todos os documentos) ══════════
    y = sectionBanner(doc, 'I. Identificação do Aluno', ML, y, maxW);
    const halfW = (maxW - 4) / 2; // usado nas barras de escala abaixo
    y = buildStudentBlock(doc, student, circularPhoto, ML, y, maxW);

    for (const sec of sections) {
      const H = doc.internal.pageSize.getHeight();
      if (y > cBot(H) - 20) { y = newPage(); }

      y = sectionBanner(doc, sec.title, ML, y, maxW);

      for (const field of sec.fields) {
        const hasVal = field.value !== undefined && field.value !== null
          && field.value !== ''
          && !(Array.isArray(field.value) && field.value.length === 0);
        if (!hasVal) continue;

        if (field.type === 'scale') {
          // Renderização visual: barra de progresso + estrelas (igual generateFicha)
          const rat = typeof field.value === 'object' ? field.value?.rating : field.value;
          const obs = typeof field.value === 'object' ? field.value?.observation : '';
          const n = parseInt(String(rat)) || 0;
          const maxScale = field.maxScale || 5;

          const H2 = doc.internal.pageSize.getHeight();
          if (y > cBot(H2) - 22) { y = newPage(); }

          doc.setFont(_docFont,'bold'); doc.setFontSize(LABEL_SIZE); sc(doc, PETROL);
          doc.text(field.label.toUpperCase(), ML, y);
          y += 5;

          const barW = halfW;
          const barH = 5;
          sf(doc, [236, 244, 247] as [number, number, number]);
          sd(doc, BORDER); doc.setLineWidth(0.2);
          doc.roundedRect(ML, y, barW, barH, 1, 1, 'FD');
          const threshold80 = Math.ceil(maxScale * 0.8);
          const threshold60 = Math.ceil(maxScale * 0.6);
          const fc: [number, number, number] = n >= threshold80 ? PETROL : n >= threshold60 ? GOLD : [198, 80, 60];
          sf(doc, fc);
          if (n > 0) doc.roundedRect(ML, y, barW * (n / maxScale), barH, 1, 1, 'F');
          doc.setFont(_docFont,'normal'); doc.setFontSize(12); sc(doc, GOLD);
          doc.text('★'.repeat(n) + '☆'.repeat(maxScale - n), ML + barW + 5, y + 4.5);
          doc.setFontSize(SMALL_SIZE); sc(doc, GRAY);
          doc.text(`${n}/${maxScale}`, ML + barW + 5 + maxScale * 4.8 + 3, y + 4.5);
          y += barH + 4;

          if (obs) {
            y = renderField(doc, 'Observação', String(obs), ML, y, maxW, newPage);
          } else {
            y += 3;
          }
        } else {
          let str: string;
          if (field.type === 'checklist' && Array.isArray(field.value)) {
            str = field.value.map((v: string) => `• ${v}`).join('\n');
          } else if (field.type === 'grid' && Array.isArray(field.value)) {
            str = field.value.map((row: Record<string, string>) =>
              Object.values(row).join(' | ')).join('\n');
          } else {
            str = String(field.value ?? '—');
          }
          // Campos de recomendação/orientação → caixa âmbar de destaque
          const isRec = /recomenda|orienta|sug[eê]st|interven/i.test(field.label);
          if (isRec) {
            y = renderHighlight(doc, field.label, str, ML, y, maxW, newPage);
          } else {
            y = renderField(doc, field.label, str, ML, y, maxW, newPage);
          }
        }
      }
    }

    y = addSignatureBlock(doc, ML, y, maxW, newPage, docType, auditCode, user.name, sigOpts);
    addFooterAllPages(doc);
    return doc.output('blob') as Blob;
  },

  // ── Fichas de Observação ───────────────────────────────────────────────────
  async generateFicha(params: {
    fichaTitle: string;
    fichaIcon:  string;
    fields:     { label: string; value: string; isScale?: boolean }[];
    student:    Student;
    user:       User;
    school?:    SchoolConfig | null;
    auditCode:  string;
  }): Promise<Blob> {
    resetSubN();
    const documentCode = ensureDocumentCode('registration', params.auditCode);
    setCurrentDocumentMeta({
      code: documentCode,
      kind: 'registration',
      userName: params.user.name,
      school: params.school ?? null,
    });

    const { fichaTitle, fields, student, user, school } = params;
    const auditCode = documentCode;

    const jsPDF = await loadJsPDF();
    const doc   = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    await ensureNotoSans(doc);
    const W     = doc.internal.pageSize.getWidth();
    const maxW  = W - ML - MR;
    const qrUrl = undefined;
    _currentQrDataUrl = undefined;
    const halfW = (maxW - 4) / 2;

    const newPage = (): number => {
      doc.addPage();
      return addRunningHeader(doc, auditCode, school);
    };

    let y = addCoverBlock(doc, fichaTitle, 'FICHA DE OBSERVAÇÃO PEDAGÓGICA', auditCode, qrUrl, school?.schoolName || 'Escola');

    // ── I. Identificação do Aluno ───────────────────────────────────────────
    const fichaCircularPhoto = student.photoUrl
      ? await cropToCircle(student.photoUrl).catch(() => undefined)
      : undefined;
    y = sectionBanner(doc, 'I. Identificação do Aluno', ML, y, maxW);
    const profName = user.name.replace(/\s*(MASTER|PRO|FREE|PREMIUM|INSTITUTIONAL)\s*/gi, '').trim();
    y = buildStudentBlock(doc, student, fichaCircularPhoto, ML, y, maxW, [
      ['Profissional Responsável:', profName],
      ['Data de Aplicação:',        new Date().toLocaleDateString('pt-BR')],
    ]);

    // ── II. Campos de Observação ─────────────────────────────────────────────
    y = sectionBanner(doc, 'II. Campos de Observação', ML, y, maxW);

    for (const field of fields) {
      if (y > cBot(doc.internal.pageSize.getHeight()) - 22) { y = newPage(); }

      if (field.isScale) {
        const n = parseInt(field.value) || 0;
        doc.setFont(_docFont,'bold'); doc.setFontSize(LABEL_SIZE); sc(doc, PETROL);
        doc.text(field.label.toUpperCase(), ML, y);
        y += 4.5;

        // Barra de progresso colorida (verde/dourado/vermelho) + estrelas
        const barW = halfW;
        const barH = 5;
        sf(doc, [236, 244, 247] as [number,number,number]); sd(doc, BORDER); doc.setLineWidth(0.2);
        doc.roundedRect(ML, y, barW, barH, 1, 1, 'FD');
        const fc: [number,number,number] = n >= 4 ? PETROL : n >= 3 ? GOLD : [198, 80, 60];
        sf(doc, fc);
        if (n > 0) doc.roundedRect(ML, y, barW * (n / 5), barH, 1, 1, 'F');
        doc.setFont(_docFont,'normal'); doc.setFontSize(11); sc(doc, GOLD);
        doc.text('★'.repeat(n) + '☆'.repeat(5 - n), ML + barW + 4, y + 4.2);
        doc.setFontSize(SMALL_SIZE); sc(doc, GRAY);
        doc.text(`${n}/5`, ML + barW + 30, y + 4.2);
        y += barH + 5;
      } else {
        y = renderField(doc, field.label, field.value, ML, y, maxW, newPage);
      }
    }

    y = addSignatureBlock(doc, ML, y, maxW, newPage, 'FICHA', auditCode, user.name);
    addFooterAllPages(doc);
    return doc.output('blob') as Blob;
  },

  download(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href    = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  },

  // ── Documentos automáticos de matrícula (sem código de auditoria) ────────
  // Gerados ao finalizar a matrícula no EnrollmentWizard.
  // Tipo: 'termo_aee' | 'declaracao_matricula_srm' | 'declaracao_compromisso'
  async generateMatriculaDoc(
    tipo: 'termo_aee' | 'declaracao_matricula_srm' | 'declaracao_compromisso',
    student: Student,
    user: User,
    school: SchoolConfig | null,
  ): Promise<Blob> {
    _currentAuditCode = '';
    _currentUserName  = user.name.replace(/\s*(MASTER|PRO|FREE|PREMIUM|INSTITUTIONAL)\s*/gi, '').trim();
    _currentSchool    = school;
    _currentDocKind   = 'registration';
    _currentQrDataUrl = undefined;
    _currentGeneratedAt = new Date().toISOString();

    const jsPDF   = await loadJsPDF();
    const doc     = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    await ensureNotoSans(doc);
    const W       = doc.internal.pageSize.getWidth();
    const H       = doc.internal.pageSize.getHeight();
    const maxW    = W - ML - MR;
    const halfW   = (maxW - 4) / 2;
    const sName   = school?.schoolName || 'Escola não informada';
    const dateStr = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
    const profName = user.name.replace(/\s*(MASTER|PRO|FREE|PREMIUM|INSTITUTIONAL)\s*/gi, '').trim();

    // Cabeçalho institucional reutilizável em novas páginas
    const drawMatriculaHeader = (): number => {
      sf(doc, PETROL); doc.rect(0, 0, W, 8, 'F');
      sf(doc, GOLD);   doc.rect(0, 8, W, 1.5, 'F');
      doc.setFont(_docFont,'bold'); doc.setFontSize(9); sc(doc, DARK);
      doc.text(sName, ML, 20);
      doc.setFont('courier', 'normal'); doc.setFontSize(7.5); sc(doc, GRAY);
      doc.text('www.incluiai.app.br', W - MR, 20, { align: 'right' });
      sd(doc, BORDER); doc.setLineWidth(0.3);
      doc.line(ML, 26, W - MR, 26);
      return 36; // y de início do conteúdo
    };

    const newPage = (): number => { doc.addPage(); return drawMatriculaHeader(); };

    const TITLES: Record<typeof tipo, string> = {
      termo_aee:               'TERMO DE COMPROMISSO DO ALUNO NO AEE',
      declaracao_matricula_srm:'DECLARAÇÃO DE MATRÍCULA NA SALA DE RECURSOS MULTIFUNCIONAIS',
      declaracao_compromisso:  'DECLARAÇÃO DE COMPROMISSO FAMILIAR',
    };
    const title = TITLES[tipo];

    let y = drawMatriculaHeader();

    // Título — TITLE_SIZE centrado
    doc.setFont(_docFont,'bold'); doc.setFontSize(TITLE_SIZE); sc(doc, PETROL);
    const titleLines: string[] = doc.splitTextToSize(title, maxW);
    doc.text(titleLines, W / 2, y, { align: 'center' });
    y += titleLines.length * 7 + 3;

    // Subtítulo
    doc.setFont(_docFont,'normal'); doc.setFontSize(SMALL_SIZE); sc(doc, GRAY);
    doc.text(`Atendimento Educacional Especializado — AEE | Ano Letivo ${new Date().getFullYear()}`, W / 2, y, { align: 'center' });
    y += 12;

    // ── I. Identificação do Aluno ───────────────────────────────────────────
    sf(doc, PETROL); doc.roundedRect(ML, y, maxW, 7.5, 1.5, 1.5, 'F');
    doc.setFont(_docFont,'bold'); doc.setFontSize(SECTION_SIZE); sc(doc, WHITE);
    doc.text('I. IDENTIFICAÇÃO DO ALUNO', ML + 4, y + 5.5);
    y += 11;

    const kvData: [string, string][] = [
      ['Aluno(a):', student.name || '—'],
      ['Data de Nascimento:', formatBirthDate(student.birthDate) || '—'],
      ['Série / Turma:', student.grade || '—'],
      ['Turno:', student.shift || '—'],
      ['Responsável Legal:', student.guardianName || '—'],
      ['Telefone:', student.guardianPhone || '—'],
    ];
    y = kvGrid(doc, kvData, ML, y, maxW);
    y += 6;

    // ── Corpo do documento por tipo ────────────────────────────────────────
    if (tipo === 'termo_aee') {
      sf(doc, PETROL); doc.roundedRect(ML, y, maxW, 7.5, 1.5, 1.5, 'F');
      doc.setFont(_docFont,'bold'); doc.setFontSize(SECTION_SIZE); sc(doc, WHITE);
      doc.text('II. TERMOS E CONDIÇÕES', ML + 4, y + 5.5);
      y += 12;

      const clausulas = [
        `1. O(A) aluno(a) ${student.name} é formalmente matriculado(a) no Atendimento Educacional Especializado (AEE) da instituição ${sName}, conforme previsto pela Resolução CNE/CEB nº 4, de 2 de outubro de 2009 e pela Política Nacional de Educação Especial na Perspectiva da Educação Inclusiva.`,
        `2. O responsável legal declara ciência de que o AEE é um serviço complementar e não substitutivo ao ensino regular, sendo realizado preferencialmente na Sala de Recursos Multifuncionais (SRM) no contraturno escolar.`,
        `3. O responsável compromete-se a colaborar com as orientações do professor do AEE, participar das reuniões de acompanhamento e comunicar à instituição qualquer alteração relevante nas condições de saúde ou desenvolvimento do(a) aluno(a).`,
        `4. A instituição compromete-se a garantir atendimento individualizado, elaboração de Plano de AEE e comunicação regular com a família sobre o desenvolvimento do(a) aluno(a).`,
        `5. Este termo tem validade pelo ano letivo vigente, podendo ser renovado mediante nova avaliação pedagógica.`,
      ];

      for (const cl of clausulas) {
        doc.setFont(_docFont,'normal'); doc.setFontSize(10); sc(doc, DARK);
        const lines: string[] = doc.splitTextToSize(cl, maxW);
        if (y + lines.length * LINE_H > cBot(H) - 30) { y = newPage(); }
        doc.text(lines, ML, y);
        y += lines.length * LINE_H + 5;
      }
    }

    if (tipo === 'declaracao_matricula_srm') {
      sf(doc, PETROL); doc.roundedRect(ML, y, maxW, 7.5, 1.5, 1.5, 'F');
      doc.setFont(_docFont,'bold'); doc.setFontSize(SECTION_SIZE); sc(doc, WHITE);
      doc.text('II. DECLARAÇÃO OFICIAL', ML + 4, y + 5.5);
      y += 12;

      const body = `Declaramos, para os devidos fins, que o(a) aluno(a) ${student.name}, regularmente matriculado(a) no Ensino Regular na série ${student.grade || 'não informada'}, turno ${student.shift || 'não informado'}, encontra-se igualmente matriculado(a) na Sala de Recursos Multifuncionais (SRM) desta instituição, conforme deliberado pelo Conselho Pedagógico e registrado em ${dateStr}.

O Atendimento Educacional Especializado (AEE) prestado na SRM tem como objetivo eliminar as barreiras que possam obstruir o processo de escolarização dos alunos público-alvo da Educação Especial, em conformidade com a Resolução CNE/CEB nº 4/2009 e o Decreto nº 7.611/2011.

Esta declaração é fornecida a pedido do(a) interessado(a) para os fins que se fizerem necessários.`;

      doc.setFont(_docFont,'normal'); doc.setFontSize(10); sc(doc, DARK);
      const bodyLines: string[] = doc.splitTextToSize(body, maxW);
      if (y + bodyLines.length * LINE_H > cBot(H) - 10) { y = newPage(); }
      doc.text(bodyLines, ML, y);
      y += bodyLines.length * LINE_H + 10;
    }

    if (tipo === 'declaracao_compromisso') {
      sf(doc, PETROL); doc.roundedRect(ML, y, maxW, 7.5, 1.5, 1.5, 'F');
      doc.setFont(_docFont,'bold'); doc.setFontSize(SECTION_SIZE); sc(doc, WHITE);
      doc.text('II. DECLARAÇÃO DE COMPROMISSO FAMILIAR', ML + 4, y + 5.5);
      y += 12;

      const body = `Eu, ${student.guardianName || '______________________________'}, responsável legal pelo(a) aluno(a) ${student.name}, declaro estar ciente e de acordo com as condições do Atendimento Educacional Especializado (AEE) oferecido pela instituição ${sName}, comprometendo-me a:

• Comparecer às reuniões de acompanhamento convocadas pela equipe pedagógica;
• Manter a frequência regular do(a) aluno(a) nos atendimentos do AEE;
• Comunicar à instituição quaisquer mudanças relevantes na condição de saúde, medicação ou contexto familiar do(a) aluno(a);
• Colaborar com as orientações e estratégias definidas no Plano de AEE;
• Respeitar e contribuir com o processo pedagógico especializado.

Declaro ainda ter recebido orientações claras sobre o funcionamento do AEE e sobre os direitos e deveres previstos na legislação vigente de Educação Especial Inclusiva.`;

      doc.setFont(_docFont,'normal'); doc.setFontSize(10); sc(doc, DARK);
      const bodyLines: string[] = doc.splitTextToSize(body, maxW);
      if (y + bodyLines.length * LINE_H > cBot(H) - 10) { y = newPage(); }
      doc.text(bodyLines, ML, y);
      y += bodyLines.length * LINE_H + 10;
    }

    // ── Bloco de assinatura simplificado ──────────────────────────────────
    y += 6;
    if (y > H - MB - FOOTER_H - 40) { y = newPage(); }

    doc.setFont(_docFont,'normal'); doc.setFontSize(9); sc(doc, DARK);
    doc.text(`${sName}, ${dateStr}`, ML, y);
    y += 16;

    // Linha responsável legal
    sd(doc, DARK); doc.setLineWidth(0.3);
    doc.line(ML, y, ML + 80, y);
    y += 4;
    doc.setFont(_docFont,'bold'); doc.setFontSize(8.5); sc(doc, DARK);
    doc.text(student.guardianName || 'Responsável Legal', ML, y);
    y += 4;
    doc.setFont(_docFont,'normal'); doc.setFontSize(7.5); sc(doc, GRAY);
    doc.text('Responsável Legal do Aluno', ML, y);

    // Linha profissional
    const sigColX = ML + halfW + 8;
    sd(doc, DARK); doc.setLineWidth(0.3);
    doc.line(sigColX, y - 12, sigColX + halfW - 8, y - 12);
    doc.setFont(_docFont,'bold'); doc.setFontSize(SMALL_SIZE + 0.5); sc(doc, DARK);
    doc.text(profName, sigColX, y - 8);
    doc.setFont(_docFont,'normal'); doc.setFontSize(SMALL_SIZE); sc(doc, GRAY);
    doc.text('Professor(a) de AEE / Profissional Responsável', sigColX, y - 4);

    // ── Base Legal e LGPD ──────────────────────────────────────────────────
    y += 12;
    sd(doc, BORDER); doc.setLineWidth(0.3); doc.line(ML, y, W - MR, y);
    y += 4;
    doc.setFont(_docFont,'bold'); doc.setFontSize(TINY_SIZE); sc(doc, PETROL);
    doc.text('BASE LEGAL:', ML, y);
    
    doc.setFont(_docFont,'normal'); sc(doc, GRAY);
    const legalM = 'Resolução CNE/CEB nº 4/2009; Decreto nº 7.611/2011; Lei nº 13.146/2015 (LBI); Lei nº 9.394/1996 (LDB Art. 59).';
    const legalLsM: string[] = doc.splitTextToSize(legalM, maxW);
    doc.text(legalLsM, ML, y + 4);
    y += legalLsM.length * 3.5 + 4;
    
    doc.setFont(_docFont,'italic'); doc.setFontSize(TINY_SIZE); sc(doc, GRAY);
    doc.text('Documento pedagógico institucional. Dados pessoais protegidos pela Lei nº 13.709/2018 (LGPD). Uso restrito à equipe escolar.', ML, y);

    addFooterAllPages(doc);
    return doc.output('blob') as Blob;
  },
};

// ─── PERFIL INTELIGENTE PDF ───────────────────────────────────────────────────

export async function generateIntelligentProfilePDF(params: {
  profile: IntelligentProfileJSON;
  student: Student;
  versionNumber: number;
  generatedAt: string;
  generatedByName: string;
  school?: SchoolConfig | null;
}): Promise<void> {
  return IntelligentProfilePDFDocument(params);

  const { profile, student, versionNumber, generatedAt, generatedByName, school } = params;

  const jsPDF  = await loadJsPDF();
  const doc    = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  await ensureNotoSans(doc);

  const W    = doc.internal.pageSize.getWidth();
  const H    = doc.internal.pageSize.getHeight();
  const maxW = W - ML - MR;

  const auditCode = `PI-${student.id.slice(-8).toUpperCase()}-V${versionNumber}`;
  _currentAuditCode = auditCode;
  _currentUserName  = generatedByName;
  _currentSchool    = school ?? null;

  const genDate = new Date(generatedAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const genTime = new Date(generatedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  let circularPhoto: string | undefined;
  if (student.photoUrl) {
    try { circularPhoto = await cropToCircle(student.photoUrl); } catch {}
  }
  const qrUrl = await buildQr(auditCode);

  // ── Status maps ──────────────────────────────────────────────────────────────
  const STATUS_COLORS: Record<SIPChecklistItem['status'], [number,number,number]> = {
    presente:          [22, 163, 74],
    em_desenvolvimento:[198, 146, 20],
    nao_observado:     [156, 163, 175],
  };
  const STATUS_BG: Record<SIPChecklistItem['status'], [number,number,number]> = {
    presente:          [240, 253, 244],
    em_desenvolvimento:[254, 252, 232],
    nao_observado:     [248, 250, 252],
  };
  const STATUS_LABELS: Record<SIPChecklistItem['status'], string> = {
    presente:          'Presente',
    em_desenvolvimento:'Em desenvolvimento',
    nao_observado:     'Não observado',
  };

  // ── Local helpers ────────────────────────────────────────────────────────────
  function newPage(): number {
    doc.addPage();
    return addRunningHeader(doc, auditCode, school) + 4;
  }

  function ensureY(y: number, needed: number): number {
    return y > cBot(H) - needed ? newPage() : y;
  }

  function textBlock(text: string, x: number, y: number, w: number): number {
    if (!text?.trim()) return y;
    doc.setFont(_docFont, 'normal');
    doc.setFontSize(BODY_SIZE);
    sc(doc, DARK);
    for (const para of text.split('\n').filter(Boolean)) {
      const lines: string[] = doc.splitTextToSize(para, w);
      for (const ln of lines) {
        if (y > cBot(H) - 6) { y = newPage(); }
        doc.text(ln, x, y);
        y += LINE_H;
      }
      y += 1.5;
    }
    return y + 1;
  }

  function sectionDividerLabel(label: string, y: number): number {
    y = ensureY(y, 14);
    const tw = doc.getTextWidth(label);
    const lw = (maxW - tw - 10) / 2;
    sd(doc, BORDER);
    doc.setLineWidth(0.2);
    doc.line(ML, y, ML + lw, y);
    doc.setFont(_docFont, 'bold');
    doc.setFontSize(TINY_SIZE);
    sc(doc, GRAY);
    doc.text(label, ML + lw + 5, y + 1.5);
    doc.line(ML + lw + tw + 10, y, W - MR, y);
    return y + 10;
  }

  // Renders a badge-style chip: dot + label text + status pill
  function skillChip(item: SIPChecklistItem, x: number, y: number, w: number): number {
    if (y > cBot(H) - 7) { y = newPage(); }
    const col   = STATUS_COLORS[item.status];
    const bgCol = STATUS_BG[item.status];
    const slbl  = STATUS_LABELS[item.status];
    // Colored dot
    sf(doc, col); sd(doc, col);
    doc.circle(x + 2, y - 1.4, 1.5, 'F');
    // Item label
    doc.setFont(_docFont, 'normal');
    doc.setFontSize(TABLE_SIZE);
    sc(doc, DARK);
    const lblLines: string[] = doc.splitTextToSize(item.label, w - 46);
    doc.text(lblLines, x + 7, y);
    // Status badge (right-aligned pill)
    const bw = doc.getTextWidth(slbl) + 6;
    sf(doc, bgCol); sd(doc, col);
    doc.setLineWidth(0.15);
    doc.roundedRect(x + w - bw, y - 3.5, bw, 5, 1, 1, 'FD');
    doc.setFont(_docFont, 'bold');
    doc.setFontSize(TINY_SIZE);
    sc(doc, col);
    doc.text(slbl, x + w - bw + 3, y);
    // Thin separator
    sd(doc, BORDER);
    doc.setLineWidth(0.1);
    doc.line(x, y + 2.5, x + w, y + 2.5);
    return y + 6.5;
  }

  // Gold-dot bullet
  function bullet(text: string, x: number, y: number, w: number, color: [number,number,number] = GOLD): number {
    if (y > cBot(H) - 7) { y = newPage(); }
    sf(doc, color); sd(doc, color);
    doc.circle(x + 1.5, y - 1.5, 1.2, 'F');
    doc.setFont(_docFont, 'normal');
    doc.setFontSize(BODY_SIZE);
    sc(doc, DARK);
    const ls: string[] = doc.splitTextToSize(text, w - 7);
    doc.text(ls, x + 6, y);
    return y + ls.length * LINE_H + 1;
  }

  // Open checkbox (print-friendly)
  function checkbox(text: string, x: number, y: number, w: number, lightText = false): number {
    if (y > cBot(H) - 7) { y = newPage(); }
    sd(doc, lightText ? (WHITE as any) : (PETROL as any));
    doc.setLineWidth(0.3);
    doc.roundedRect(x, y - 3.5, 4, 4, 0.5, 0.5, 'D');
    doc.setFont(_docFont, 'normal');
    doc.setFontSize(BODY_SIZE);
    sc(doc, lightText ? [200, 220, 230] as any : DARK);
    const ls: string[] = doc.splitTextToSize(text, w - 8);
    doc.text(ls, x + 7, y);
    return y + ls.length * LINE_H + 1;
  }

  // Card: draws rounded white rectangle with optional colored border
  function drawCard(y: number, h: number, borderCol: [number,number,number] = BORDER): void {
    sf(doc, WHITE); sd(doc, borderCol);
    doc.setLineWidth(0.25);
    doc.roundedRect(ML, y, maxW, h, 2, 2, 'FD');
  }

  // Renders full analysis card (tinted header + text body + skill chips)
  function analysisCard(
    y: number,
    title: string,
    hdrBg: [number,number,number],
    hdrFg: [number,number,number],
    body: string,
    checklist: SIPChecklistItem[],
  ): number {
    const bodyLines: string[] = doc.splitTextToSize(body || ' ', maxW - 10);
    const bodyH  = bodyLines.length * LINE_H + 4;
    const chipsH = checklist.length > 0 ? checklist.length * 7 + 14 : 0;
    const cardH  = 12 + bodyH + chipsH + 8;
    y = ensureY(y, cardH + 4);
    drawCard(y, cardH);
    // Header strip
    sf(doc, hdrBg); sd(doc, hdrBg);
    doc.roundedRect(ML + 0.3, y + 0.3, maxW - 0.6, 11, 1.5, 1.5, 'F');
    doc.setFont(_docFont, 'bold');
    doc.setFontSize(SECTION_SIZE);
    sc(doc, hdrFg);
    doc.text(title, ML + 5, y + 7.5);
    let cy = y + 16;
    // Body text
    if (body?.trim()) {
      doc.setFont(_docFont, 'normal');
      doc.setFontSize(BODY_SIZE);
      sc(doc, DARK);
      doc.text(bodyLines, ML + 5, cy);
      cy += bodyLines.length * LINE_H + 4;
    }
    // Chip list
    if (checklist.length > 0) {
      sd(doc, BORDER); doc.setLineWidth(0.15);
      doc.line(ML + 5, cy, W - MR - 5, cy);
      cy += 5;
      doc.setFont(_docFont, 'bold');
      doc.setFontSize(TINY_SIZE);
      sc(doc, GRAY);
      doc.text('STATUS DE HABILIDADES', ML + 5, cy);
      cy += 5;
      for (const item of checklist) {
        cy = skillChip(item, ML + 5, cy, maxW - 10);
      }
    }
    return cy + 8;
  }

  // ── PAGE 1 — COVER ───────────────────────────────────────────────────────────
  addCoverBlock(
    doc,
    'Perfil Inteligente do Aluno',
    `LEITURA PEDAGÓGICA E NEUROPEDAGÓGICA — VERSÃO ${versionNumber}`,
    auditCode, qrUrl,
    school?.schoolName ?? 'Sistema IncluiAI',
  );

  let y = 55;
  y = buildStudentBlock(doc, student, circularPhoto, ML, y, maxW, [
    ['Professor(a) Regente:', student.regentTeacher || '—'],
    ['Professor(a) AEE:',     student.aeeTeacher    || '—'],
    ['Gerado em:',            `${genDate} às ${genTime}`],
    ['Gerado por:',           generatedByName],
    ['Versão:',               `${versionNumber}`],
  ]);

  // ── QUEM SOU EU ──────────────────────────────────────────────────────────────
  y = sectionDividerLabel('QUEM SOU EU?', y + 6);
  const letter = profile.firstPersonLetter || profile.humanizedIntroduction.text;
  const letterLines: string[] = doc.splitTextToSize(letter, maxW - 16);
  const quemCardH = letterLines.length * LINE_H + 22;
  y = ensureY(y, quemCardH + 4);

  // Light teal card
  sf(doc, [238, 245, 248] as any); sd(doc, [197, 221, 231] as any);
  doc.setLineWidth(0.25);
  doc.roundedRect(ML, y, maxW, quemCardH, 3, 3, 'FD');
  // Petrol left accent bar
  sf(doc, PETROL);
  doc.roundedRect(ML, y, 3, quemCardH, 1, 1, 'F');
  // Title
  doc.setFont(_docFont, 'bold');
  doc.setFontSize(SECTION_SIZE);
  sc(doc, PETROL);
  doc.text('Quem sou eu?', ML + 9, y + 8);
  // Italic text
  doc.setFont(_docFont, 'italic');
  doc.setFontSize(BODY_SIZE + 0.5);
  sc(doc, [46, 58, 82] as any);
  doc.text(letterLines, ML + 9, y + 16);
  y += quemCardH + 8;

  // ── ANÁLISE MULTIDISCIPLINAR ─────────────────────────────────────────────────
  y = sectionDividerLabel('ANÁLISE MULTIDISCIPLINAR', y);

  y = analysisCard(y,
    'Parecer Pedagógico Educacional',
    [238, 245, 248] as [number,number,number],
    PETROL,
    profile.pedagogicalReport.text,
    profile.pedagogicalReport.checklist,
  );

  y = analysisCard(y + 2,
    'Parecer Neuropedagógico',
    [243, 240, 255] as [number,number,number],
    [88, 28, 135] as [number,number,number],
    profile.neuroPedagogicalReport.text,
    profile.neuroPedagogicalReport.checklist,
  );

  // Potencialidades
  const strengths = profile.strengths ?? profile.nextSteps ?? [];
  if (strengths.length > 0) {
    const ptCardH = strengths.length * 7 + 22;
    y = ensureY(y + 4, ptCardH + 4);
    drawCard(y, ptCardH, [167, 243, 208] as any);
    sf(doc, [240, 253, 244] as any); sd(doc, [167, 243, 208] as any);
    doc.roundedRect(ML + 0.3, y + 0.3, maxW - 0.6, 11, 1.5, 1.5, 'F');
    doc.setFont(_docFont, 'bold');
    doc.setFontSize(SECTION_SIZE);
    sc(doc, [21, 128, 61] as any);
    doc.text('Potencialidades', ML + 5, y + 7.5);
    let sy = y + 16;
    for (const item of strengths) {
      sy = bullet(item, ML + 5, sy, maxW - 10, [22, 163, 74] as [number,number,number]);
    }
    y = sy + 8;
  }

  // ── COMO APRENDE MELHOR ──────────────────────────────────────────────────────
  y = sectionDividerLabel('COMO APRENDE MELHOR', y + 4);
  const learnItems = profile.bestLearningStrategies.items;
  const learnCardH = learnItems.length * 8 + 22;
  y = ensureY(y, learnCardH + 4);
  drawCard(y, learnCardH, [240, 228, 181] as any);
  sf(doc, [253, 248, 236] as any); sd(doc, [240, 228, 181] as any);
  doc.roundedRect(ML + 0.3, y + 0.3, maxW - 0.6, 11, 1.5, 1.5, 'F');
  doc.setFont(_docFont, 'bold');
  doc.setFontSize(SECTION_SIZE);
  sc(doc, [146, 105, 10] as any);
  doc.text('Como Aprende Melhor', ML + 5, y + 7.5);
  let ly = y + 16;
  for (const item of learnItems) {
    if (ly > cBot(H) - 7) { ly = newPage(); }
    sf(doc, GOLD); sd(doc, GOLD);
    doc.circle(ML + 7, ly - 1.5, 1.8, 'F');
    doc.setFont(_docFont, 'normal');
    doc.setFontSize(BODY_SIZE);
    sc(doc, DARK);
    const ils: string[] = doc.splitTextToSize(item, maxW - 18);
    doc.text(ils, ML + 12, ly);
    ly += ils.length * LINE_H + 2;
  }
  y = ly + 8;

  // Pontos de Cuidado
  const challenges = profile.challenges ?? (profile.carePoints ?? []).map(c => ({ title: 'Ponto de Atenção', description: c }));
  if (challenges.length > 0) {
    const chalCardH = challenges.reduce((acc, c) => {
      const dLines: string[] = doc.splitTextToSize(c.description, maxW - 18);
      return acc + dLines.length * LINE_H + 10;
    }, 22);
    y = ensureY(y + 2, chalCardH + 4);
    drawCard(y, chalCardH, [253, 186, 116] as any);
    sf(doc, [255, 247, 237] as any); sd(doc, [253, 186, 116] as any);
    doc.roundedRect(ML + 0.3, y + 0.3, maxW - 0.6, 11, 1.5, 1.5, 'F');
    doc.setFont(_docFont, 'bold');
    doc.setFontSize(SECTION_SIZE);
    sc(doc, [194, 65, 12] as any);
    doc.text('Pontos de Cuidado', ML + 5, y + 7.5);
    let cy2 = y + 16;
    for (const c of challenges) {
      if (cy2 > cBot(H) - 8) { cy2 = newPage(); }
      sf(doc, [249, 115, 22] as any); sd(doc, [249, 115, 22] as any);
      doc.circle(ML + 7, cy2 - 1.5, 2, 'F');
      doc.setFont(_docFont, 'bold');
      doc.setFontSize(BODY_SIZE);
      sc(doc, [124, 45, 18] as any);
      doc.text(`${c.title}:`, ML + 12, cy2);
      cy2 += LINE_H;
      doc.setFont(_docFont, 'normal');
      sc(doc, DARK);
      const dls: string[] = doc.splitTextToSize(c.description, maxW - 18);
      doc.text(dls, ML + 12, cy2);
      cy2 += dls.length * LINE_H + 3;
    }
    y = cy2 + 8;
  }

  // ── ATIVIDADES INDICADAS ─────────────────────────────────────────────────────
  if (profile.recommendedActivities.length > 0) {
    y = sectionDividerLabel('ATIVIDADES INDICADAS', y + 4);

    for (const act of profile.recommendedActivities) {
      const objLines: string[] = doc.splitTextToSize(act.objective || '', maxW - 10);
      const colW = (maxW - 14) / 2;
      const howLines: string[] = doc.splitTextToSize(act.howToApply || '', colW - 2);
      const whyLines: string[] = doc.splitTextToSize(act.whyItHelps || '', colW - 2);
      const titleLines2: string[] = doc.splitTextToSize(act.title, maxW - 40);
      const hdrH = titleLines2.length * LINE_H + 8;
      const actH = hdrH + objLines.length * LINE_H + Math.max(howLines.length, whyLines.length) * LINE_H + 36;

      y = ensureY(y, actH + 4);
      drawCard(y, actH);

      // Teal header
      sf(doc, [238, 245, 248] as any); sd(doc, [197, 221, 231] as any);
      doc.roundedRect(ML + 0.3, y + 0.3, maxW - 0.6, hdrH, 1.5, 1.5, 'F');
      doc.setFont(_docFont, 'bold');
      doc.setFontSize(BODY_SIZE + 0.5);
      sc(doc, PETROL);
      doc.text(titleLines2, ML + 5, y + 6);

      // Support badge
      const lvlColor: [number,number,number] = act.supportLevel === 'Baixo'
        ? [21, 128, 61] : act.supportLevel === 'Alto' ? [190, 18, 60] : [161, 98, 7];
      const lvlBg: [number,number,number] = act.supportLevel === 'Baixo'
        ? [240, 253, 244] : act.supportLevel === 'Alto' ? [254, 242, 242] : [254, 252, 232];
      const lvlTxt = `Apoio ${act.supportLevel}`;
      const lvlW = doc.getTextWidth(lvlTxt) + 6;
      sf(doc, lvlBg); sd(doc, lvlColor);
      doc.setLineWidth(0.2);
      doc.roundedRect(W - MR - lvlW - 1, y + 3, lvlW, 5, 1, 1, 'FD');
      doc.setFont(_docFont, 'bold');
      doc.setFontSize(TINY_SIZE);
      sc(doc, lvlColor);
      doc.text(lvlTxt, W - MR - lvlW + 2, y + 6.8);

      let ay = y + hdrH + 5;

      if (act.objective) {
        doc.setFont(_docFont, 'bold');
        doc.setFontSize(TINY_SIZE);
        sc(doc, PETROL);
        doc.text('OBJETIVO', ML + 5, ay);
        ay += 4.5;
        doc.setFont(_docFont, 'normal');
        doc.setFontSize(BODY_SIZE);
        sc(doc, DARK);
        doc.text(objLines, ML + 5, ay);
        ay += objLines.length * LINE_H + 4;
      }

      // Como Aplicar + Por que Ajuda side by side
      if (act.howToApply || act.whyItHelps) {
        // Left: como aplicar
        if (act.howToApply) {
          doc.setFont(_docFont, 'bold');
          doc.setFontSize(TINY_SIZE);
          sc(doc, [46, 78, 95] as any);
          doc.text('COMO APLICAR', ML + 5, ay);
          doc.setFont(_docFont, 'normal');
          doc.setFontSize(BODY_SIZE);
          sc(doc, DARK);
          doc.text(howLines, ML + 5, ay + 4.5);
        }
        // Right: por que ajuda
        if (act.whyItHelps) {
          doc.setFont(_docFont, 'bold');
          doc.setFontSize(TINY_SIZE);
          sc(doc, [21, 128, 61] as any);
          doc.text('POR QUE AJUDA', ML + 5 + colW + 4, ay);
          doc.setFont(_docFont, 'normal');
          doc.setFontSize(BODY_SIZE);
          sc(doc, DARK);
          doc.text(whyLines, ML + 5 + colW + 4, ay + 4.5);
        }
        ay += Math.max(howLines.length, whyLines.length) * LINE_H + 10;
      }

      y = ay + 4;
    }
  }

  // ── PONTOS DE OBSERVAÇÃO ─────────────────────────────────────────────────────
  y = sectionDividerLabel('PONTOS DE OBSERVAÇÃO', y + 4);
  const obsTxtLines: string[] = profile.observationPoints.text
    ? doc.splitTextToSize(profile.observationPoints.text, maxW - 10)
    : [];
  const obsList = profile.observationPoints.checklist;
  const obsCardH = obsTxtLines.length * LINE_H + obsList.length * 7 + 26;
  y = ensureY(y, obsCardH + 4);

  // Dark petrol card
  sf(doc, PETROL); sd(doc, PETROL);
  doc.setLineWidth(0.25);
  doc.roundedRect(ML, y, maxW, obsCardH, 3, 3, 'F');
  // Slightly lighter strip for label
  sf(doc, [26, 66, 80] as any);
  doc.roundedRect(ML + 0.3, y + 0.3, maxW - 0.6, 11, 1.5, 1.5, 'F');
  doc.setFont(_docFont, 'bold');
  doc.setFontSize(SECTION_SIZE);
  sc(doc, WHITE);
  doc.text('Pontos de Observação', ML + 5, y + 7.5);

  let oy = y + 16;
  if (obsTxtLines.length > 0) {
    doc.setFont(_docFont, 'normal');
    doc.setFontSize(BODY_SIZE);
    sc(doc, [200, 220, 230] as any);
    doc.text(obsTxtLines, ML + 5, oy);
    oy += obsTxtLines.length * LINE_H + 6;
  }
  if (obsList.length > 0) {
    doc.setFont(_docFont, 'bold');
    doc.setFontSize(TINY_SIZE);
    sc(doc, [150, 185, 200] as any);
    doc.text('CHECKLIST DE AVALIAÇÃO DIÁRIA', ML + 5, oy);
    oy += 5;
    for (const item of obsList) {
      oy = checkbox(item, ML + 5, oy, maxW - 10, true);
    }
  }
  y = oy + 8;

  // ── ASSINATURAS ──────────────────────────────────────────────────────────────
  y = ensureY(y + 8, 70);

  doc.setFont(_docFont, 'bold');
  doc.setFontSize(TINY_SIZE);
  sc(doc, GRAY);
  doc.text('CIÊNCIA E VALIDAÇÃO DA EQUIPE MULTIDISCIPLINAR', W / 2, y, { align: 'center' });
  y += 2;
  sd(doc, BORDER); doc.setLineWidth(0.2);
  doc.line(ML + 15, y, W - MR - 15, y);
  y += 16;

  const school2 = school?.schoolName ?? 'Sistema IncluiAI';
  doc.setFont(_docFont, 'normal');
  doc.setFontSize(BODY_SIZE - 0.5);
  sc(doc, DARK);
  doc.text(`${school2} — ${genDate}`, ML, y);
  y += 16;

  const sigW2 = (maxW - 10) / 3;
  const signers = [
    { name: student.regentTeacher || 'Professor(a) Regente', role: 'Professor(a) Regente' },
    { name: student.aeeTeacher    || 'Prof. do AEE',         role: 'Professor(a) do AEE' },
    { name: 'Coordenação Pedagógica',                        role: school2 },
  ];
  signers.forEach((sig, i) => {
    const sx = ML + i * (sigW2 + 5);
    sf(doc, [238, 245, 248] as any); sd(doc, [197, 221, 231] as any);
    doc.setLineWidth(0.3);
    doc.line(sx, y, sx + sigW2, y);
    doc.setFont(_docFont, 'bold');
    doc.setFontSize(TINY_SIZE);
    sc(doc, DARK);
    doc.text(sig.name, sx + sigW2 / 2, y + 5, { align: 'center' });
    doc.setFont(_docFont, 'normal');
    sc(doc, GRAY);
    doc.text(sig.role, sx + sigW2 / 2, y + 9.5, { align: 'center' });
    doc.text('Matrícula: _______________', sx + sigW2 / 2, y + 14, { align: 'center' });
  });
  y += 22;

  doc.setFont(_docFont, 'italic');
  doc.setFontSize(TINY_SIZE);
  sc(doc, GRAY);
  doc.text(
    `Documento gerado pelo IncluiAI em ${genDate} às ${genTime} por ${generatedByName}. Versão ${versionNumber}. Cód. ${auditCode}.`,
    ML, y,
  );

  addFooterAllPages(doc);

  const fileName = `PerfilInteligente_${student.name.replace(/\s+/g, '_')}_V${versionNumber}.pdf`;
  doc.save(fileName);
}

// ─── Public helpers ───────────────────────────────────────────────────────────
export function getDocTitle(docType: string): string {
  const map: Record<string, string> = {
    checklist_4laudas:         'Checklist de Observação',
    encaminhamento_redes:      'Encaminhamento às Redes de Apoio',
    convite_reuniao:           'Convite para Reunião',
    termo_compromisso_aee:     'Termo de Compromisso AEE',
    declaracao_comparecimento: 'Declaração de Comparecimento',
    termo_desligamento:        'Termo de Desligamento',
    declaracao_matricula:      'Declaração de Matrícula AEE',
    PEI:                       'Plano Educacional Individualizado (PEI)',
    PAEE:                      'Plano de Atendimento Educacional Especializado (PAEE)',
    PDI:                       'Plano de Desenvolvimento Individual (PDI)',
    ESTUDO_CASO:               'Estudo de Caso',
  };
  return map[docType] || docType;
}

export function getDocSubtitle(docType: string): string | null {
  const ano = new Date().getFullYear();
  const map: Record<string, string> = {
    // Protocolos pedagógicos
    PEI:                       `PLANO EDUCACIONAL INDIVIDUALIZADO — ANO LETIVO ${ano}`,
    PAEE:                      `SALA DE RECURSOS MULTIFUNCIONAIS (SRM) — ANO LETIVO ${ano}`,
    PDI:                       `PLANO DE DESENVOLVIMENTO INDIVIDUAL — ANO LETIVO ${ano}`,
    ESTUDO_CASO:               'DOCUMENTO CONFIDENCIAL — CIRCULAÇÃO RESTRITA À EQUIPE PEDAGÓGICA',
    // Fichas e checklists
    checklist_4laudas:         'FICHA DE OBSERVAÇÃO PEDAGÓGICA — AEE',
    // Documentos administrativos
    encaminhamento_redes:      'ENCAMINHAMENTO INTERSETORIAL — AEE',
    convite_reuniao:           'CONVOCAÇÃO PARA REUNIÃO PEDAGÓGICA',
    termo_compromisso_aee:     `TERMO DE COMPROMISSO — ANO LETIVO ${ano}`,
    declaracao_comparecimento: 'DECLARAÇÃO INSTITUCIONAL',
    termo_desligamento:        'REGISTRO DE ENCERRAMENTO DO ATENDIMENTO AEE',
    declaracao_matricula:      'DECLARAÇÃO DE MATRÍCULA — SALA DE RECURSOS MULTIFUNCIONAIS',
  };
  return map[docType] ?? null;
}
