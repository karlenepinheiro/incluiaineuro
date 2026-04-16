// exportService.ts — Ficha do Aluno (documento interno) + Relatório Evolutivo
// IncluiAI — Redesign Institucional v3
// Regra: Ficha = documento INTERNO → sem QR, sem URL pública, sem dados técnicos de IA
//        Relatório Evolutivo = documento OFICIAL → mantém QR + URL de validação
import { Student, StudentEvolution, DocField, SchoolConfig } from "../types";
import QRCode from 'qrcode';

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
  const parts = birthDate.includes('/') ? birthDate.split('/') : birthDate.split('-');
  if (parts.length < 3) return '';
  const [d, m, y] = parts.map(Number);
  if (!y || !m) return '';
  const today = new Date();
  let age = today.getFullYear() - y;
  const monthOk = today.getMonth() + 1 < m ||
    (today.getMonth() + 1 === m && today.getDate() < d);
  if (monthOk) age--;
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
async function buildQrDataUrl(auditCode: string): Promise<string | undefined> {
  try {
    return await QRCode.toDataURL(
      `https://www.incluiai.app.br/validar/${auditCode}`,
      { margin: 0, width: 256 },
    );
  } catch { return undefined; }
}

function makeAuditCode(prefix: string, id: string): string {
  let hash = 0;
  const str = id + Date.now().toString();
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return `${prefix}-${Math.abs(hash).toString(16).toUpperCase().padStart(8, "0").slice(0, 8)}`;
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
// HELPERS EXCLUSIVOS DA FICHA DO ALUNO (documento interno — sem validação pública)
// ════════════════════════════════════════════════════════════════════════════

/** Cabeçalho corrente das páginas 2+ da Ficha (sem URL de validação). */
function addFichaHeader(
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

/** Subseção com acento gold e numeração. */
function fichaSubSection(doc: any, text: string, x: number, y: number): number {
  sdd(doc, GOLD);
  sf(doc, GOLD);
  doc.rect(x, y - 1, 2.5, 5.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(F_LABEL_SIZE);
  sc(doc, BRAND);
  doc.text(text, x + 5, y + 3.5);
  return y + 8;
}

/** Grid 2 colunas para pares chave-valor (Ficha). */
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
  const rows = Math.ceil(filtered.length / 2);
  const rowH = F_LINE_H + 2.5;
  const pad  = 4;
  const boxH = rows * rowH + pad * 2 - 2;

  sf(doc, GBKG); sdd(doc, BORDER);
  doc.setLineWidth(0.2);
  doc.roundedRect(x, y, maxW, boxH, 2, 2, 'FD');

  doc.setFontSize(F_TABLE_SIZE);
  filtered.forEach(([k, v], i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const cx  = x + pad + col * (colW + 4);
    const cy  = y + pad + 4.5 + row * rowH;

    doc.setFont('helvetica', 'bold');
    sc(doc, BRAND);
    doc.text(`${k}`, cx, cy);

    const kw = doc.getTextWidth(`${k}`);
    doc.setFont('helvetica', 'normal');
    sc(doc, DARK);
    const safeV = doc.splitTextToSize(String(v || '—'), colW - kw - 2)[0] || '';
    doc.text(` ${safeV}`, cx + kw, cy);
  });

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
  return y + 3;
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

  for (const item of validItems) {
    if (y > fichaBottom(H) - 8) { y = onNewPage(); }
    doc.setFontSize(F_BODY_SIZE);
    sc(doc, BRAND);
    doc.setFont('helvetica', 'bold');
    doc.text('•', x, y);
    const bw = doc.getTextWidth('• ');
    doc.setFont('helvetica', 'normal');
    sc(doc, DARK);
    const ls = doc.splitTextToSize(item.trim(), maxW - bw);
    doc.text(ls, x + bw, y);
    y += ls.length * F_LINE_H_LIST + 1.5;
  }
  return y + 2;
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
    // Checkbox petrol
    sf(doc, BRAND); sdd(doc, BRAND);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, y - 3.5, 4, 4, 0.5, 0.5, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    sc(doc, WHITE);
    doc.text('✓', x + 0.6, y + 0.1);
    // Texto
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(F_BODY_SIZE);
    sc(doc, DARK);
    const ls = doc.splitTextToSize(item.trim(), maxW - 7);
    doc.text(ls, x + 7, y);
    y += ls.length * F_LINE_H_LIST + 1.5;
  }
  return y + 2;
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
  doc.text(getInitials(name), cx, cy + r * 0.38, { align: 'center' });
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
  doc.text(`Cód. Validação: ${auditCode}`, W - MR, 6.5, { align: 'right' });

  doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2]);
  doc.setLineWidth(0.3);
  doc.line(ML, 9, W - MR, 9);
  return 11;
}

function addDocFooter(doc: any, auditCode: string, emittedBy: string, qrDataUrl?: string): void {
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

  const qrSz   = 16;
  const qrX    = W - MR - qrSz;
  if (qrDataUrl) {
    try { doc.addImage(qrDataUrl, 'PNG', qrX, fY + 3, qrSz, qrSz); } catch {}
  }
  const textRight = qrDataUrl ? qrX - 4 : W - MR;
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
  doc.text('DOCUMENTO PEDAGÓGICO OFICIAL', textRight, fY + 7.5, { align: 'right' });

  doc.setFont('courier', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(BRAND[0], BRAND[1], BRAND[2]);
  doc.text(auditCode, cx, fY + 14, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(BRAND[0], BRAND[1], BRAND[2]);
  doc.text(`www.incluiai.app.br/validar/${auditCode}`, ML, fY + 20);
  doc.setTextColor(GRAY[0], GRAY[1], GRAY[2]);
  doc.text(
    `Página ${doc.internal.getCurrentPageInfo().pageNumber} de ${doc.internal.getNumberOfPages()}`,
    cx, fY + 20, { align: 'center' },
  );
}

function addFooterAllPages(doc: any, auditCode: string, emittedBy: string, qrDataUrl?: string): void {
  const pages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pages; i++) { doc.setPage(i); addDocFooter(doc, auditCode, emittedBy, qrDataUrl); }
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
    // halfW reserved for future two-column layout

    const internalCode = makeAuditCode('FICHA', student.id);
    const schoolForDoc = cfg.logoEscola ? school : null;

    // Pré-processa foto circular
    let circularPhoto: string | undefined;
    if (cfg.fotoAluno && student.photoUrl) {
      try { circularPhoto = await cropCircle(student.photoUrl); } catch {}
    }

    // Cabeçalho corrente das páginas 2+
    const fichaHeader = (): number => {
      const top = addFichaHeader(doc, student.name, internalCode, schoolForDoc);
      return top;
    };

    // ════════════════════════════════════════════════════════════
    // PÁGINA 1 — CAPA INSTITUCIONAL
    // ════════════════════════════════════════════════════════════
    await addStudentCover(doc, student, schoolForDoc, internalCode, circularPhoto);

    // ════════════════════════════════════════════════════════════
    // PÁGINA 2 — IDENTIFICAÇÃO COMPLETA
    // ════════════════════════════════════════════════════════════
    doc.addPage();
    let y = fichaHeader();

    // ── I. DADOS DE IDENTIFICAÇÃO ──────────────────────────────
    y = fichaSection(doc, 'I. Dados de Identificação', FL, y, maxW);

    const age     = calcAge(student.birthDate);
    const rawSex  = (student as any).gender || (student as any).sex || '';
    const gLabel  = rawSex === 'M' ? 'Masculino' : rawSex === 'F' ? 'Feminino' : rawSex || 'Não informado';
    const supLvl  = (student as any).supportLevel || (student as any).support_level || 'Não informado';
    const diagArr = student.diagnosis || [];
    const cidVal  = typeof student.cid === 'string'
      ? student.cid
      : Array.isArray(student.cid) ? (student.cid as string[]).join(', ') : '';
    const status  = (student as any).tipo_aluno === 'com_laudo' ? 'Com Laudo' :
                    (student as any).tipo_aluno === 'em_triagem' ? 'Em Triagem' : 'Em Preenchimento';
    const shift   = student.shift || (student as any).turno || '';
    const medication = (student as any).medication || '';
    const uniqueCode = (student as any).unique_code || student.id?.slice(-8) || '';

    y = fichaKvGrid(doc, [
      ['Nome Completo:',    student.name],
      ['Código do Aluno:',  uniqueCode || internalCode.split('-')[1]],
      ['Data de Nasc.:',    placeholder(student.birthDate)],
      ['Idade:',            age || 'Não informado'],
      ['Gênero:',           gLabel],
      ['Série / Turma:',    placeholder(student.grade)],
      ['Turno:',            placeholder(shift)],
      ['Escola:',           placeholder(schoolForDoc?.schoolName || (student as any).schoolName)],
      ['Nível de Suporte:', supLvl],
      ['Status:',           status],
      ['CID / Diagnóstico:', [diagArr[0], cidVal].filter(Boolean).join(' – ') || 'Não informado'],
      ['Medicação:',        placeholder(medication, 'Não usa medicação')],
    ].filter(([, v]) => !!String(v ?? '').trim()) as [string, string][], FL, y, maxW);

    // Endereço (opcional)
    if (cfg.enderecoCompleto) {
      const addr = [
        (student as any).street && [(student as any).street, (student as any).streetNumber, (student as any).complement].filter(Boolean).join(', '),
        (student as any).neighborhood,
        (student as any).city && [(student as any).city, (student as any).state].filter(Boolean).join(' — '),
        (student as any).zipcode && `CEP ${(student as any).zipcode}`,
      ].filter(Boolean).join(' · ');
      if (addr) {
        y = fichaSubSection(doc, 'Endereço', FL, y);
        y = fichaField(doc, '', addr, FL, y, maxW, fichaHeader);
      }
    }

    // ── II. RESPONSÁVEL E CONTATOS ─────────────────────────────
    if (y > fichaBottom(H) - 40) { doc.addPage(); y = fichaHeader(); }
    y = fichaSection(doc, 'II. Responsável e Contatos', FL, y, maxW);

    y = fichaKvGrid(doc, [
      ['Responsável Legal:', placeholder(student.guardianName)],
      ['Telefone:',          placeholder(student.guardianPhone)],
      ['E-mail:',            placeholder(student.guardianEmail, 'Não informado')],
    ], FL, y, maxW);

    // ── III. EQUIPE ESCOLAR ────────────────────────────────────
    if (y > fichaBottom(H) - 40) { doc.addPage(); y = fichaHeader(); }
    y = fichaSection(doc, 'III. Equipe Escolar', FL, y, maxW);

    y = fichaKvGrid(doc, [
      ['Professor(a) Regente:', placeholder(student.regentTeacher)],
      ['Professor(a) AEE:',     placeholder(student.aeeTeacher, 'Não atribuído')],
      ['Coordenação:',          placeholder(student.coordinator, 'Não informado')],
    ], FL, y, maxW);

    // ── IV. PROFISSIONAIS EXTERNOS ─────────────────────────────
    const profs = (student.professionals || []).filter((p: any) => p?.trim?.());
    if (profs.length > 0) {
      if (y > fichaBottom(H) - 30) { doc.addPage(); y = fichaHeader(); }
      y = fichaSection(doc, 'IV. Profissionais Externos', FL, y, maxW);
      y = fichaBullets(doc, profs, FL, y, maxW, fichaHeader);
    }

    // ════════════════════════════════════════════════════════════
    // PÁGINA 3 — PERFIL PEDAGÓGICO E FUNCIONAL
    // ════════════════════════════════════════════════════════════
    doc.addPage();
    y = fichaHeader();

    y = fichaSection(doc, 'V. Perfil Pedagógico e Funcional', FL, y, maxW);

    // Habilidades / Potencialidades — bullets
    y = fichaSubSection(doc, 'Habilidades / Potencialidades', FL, y);
    y = fichaBullets(doc, student.abilities || [], FL, y, maxW, fichaHeader);

    // Dificuldades / Barreiras — bullets
    if (y > fichaBottom(H) - 30) { doc.addPage(); y = fichaHeader(); }
    y = fichaSubSection(doc, 'Dificuldades / Barreiras de Aprendizagem', FL, y);
    y = fichaBullets(doc, student.difficulties || [], FL, y, maxW, fichaHeader);

    // Formas de Comunicação — bullets
    if (y > fichaBottom(H) - 25) { doc.addPage(); y = fichaHeader(); }
    y = fichaSubSection(doc, 'Formas de Comunicação', FL, y);
    y = fichaBullets(doc, student.communication || [], FL, y, maxW, fichaHeader);

    // Interação Social — texto livre
    const interacaoSocial = (student as any).interacaoSocial || (student as any).social_interaction || '';
    if (interacaoSocial) {
      if (y > fichaBottom(H) - 25) { doc.addPage(); y = fichaHeader(); }
      y = fichaSubSection(doc, 'Interação Social', FL, y);
      y = fichaField(doc, '', interacaoSocial, FL, y, maxW, fichaHeader);
    }

    // Estratégias Pedagógicas — checks (estratégias aplicadas)
    if (y > fichaBottom(H) - 30) { doc.addPage(); y = fichaHeader(); }
    y = fichaSubSection(doc, 'Estratégias Pedagógicas Eficazes', FL, y);
    y = fichaChecks(doc, student.strategies || [], FL, y, maxW, fichaHeader);

    // Adaptações e Recursos Necessários — checks
    const adaptacoes = (student as any).adaptacoes || (student as any).adaptations || [];
    const recursos   = (student as any).recursos    || (student as any).resources    || [];
    const adaptItems = [...adaptacoes, ...recursos].filter((it: any) => it?.trim?.());
    if (adaptItems.length > 0 || true) {
      if (y > fichaBottom(H) - 30) { doc.addPage(); y = fichaHeader(); }
      y = fichaSubSection(doc, 'Adaptações e Recursos Necessários', FL, y);
      y = fichaChecks(doc, adaptItems.length > 0 ? adaptItems : [], FL, y, maxW, fichaHeader);
    }

    // ════════════════════════════════════════════════════════════
    // PÁGINA 4 — RESUMO PEDAGÓGICO
    // ════════════════════════════════════════════════════════════
    doc.addPage();
    y = fichaHeader();

    // ── VI. CONTEXTO ESCOLAR ───────────────────────────────────
    y = fichaSection(doc, 'VI. Contexto Escolar', FL, y, maxW);
    y = fichaField(doc, 'Histórico Escolar', student.schoolHistory || '', FL, y, maxW, fichaHeader);

    // Diagnósticos completos
    if (diagArr.length > 0) {
      if (y > fichaBottom(H) - 20) { doc.addPage(); y = fichaHeader(); }
      y = fichaField(doc, 'Diagnósticos', diagArr.join(', '), FL, y, maxW, fichaHeader);
    }

    // ── VII. CONTEXTO FAMILIAR ─────────────────────────────────
    if (y > fichaBottom(H) - 30) { doc.addPage(); y = fichaHeader(); }
    y = fichaSection(doc, 'VII. Contexto Familiar', FL, y, maxW);
    y = fichaField(doc, '', student.familyContext || '', FL, y, maxW, fichaHeader);

    // ── VIII. OBSERVAÇÕES PEDAGÓGICAS ─────────────────────────
    if (y > fichaBottom(H) - 30) { doc.addPage(); y = fichaHeader(); }
    y = fichaSection(doc, 'VIII. Observações Pedagógicas', FL, y, maxW);
    y = fichaField(doc, '', student.observations || '', FL, y, maxW, fichaHeader);

    // ── IX. RECOMENDAÇÕES (caixa âmbar) ───────────────────────
    const recomendacoes = (student as any).recomendacoes || (student as any).recommendations || '';
    if (y > fichaBottom(H) - 30) { doc.addPage(); y = fichaHeader(); }
    y = fichaSection(doc, 'IX. Recomendações', FL, y, maxW);
    y = fichaHighlight(doc, 'Recomendações Pedagógicas', recomendacoes, FL, y, maxW, fichaHeader);

    // ── X. ENCAMINHAMENTOS ─────────────────────────────────────
    const encaminhamentos = (student as any).encaminhamentos || (student as any).referrals || '';
    if (encaminhamentos) {
      if (y > fichaBottom(H) - 25) { doc.addPage(); y = fichaHeader(); }
      y = fichaSection(doc, 'X. Encaminhamentos', FL, y, maxW);
      y = fichaField(doc, '', encaminhamentos, FL, y, maxW, fichaHeader);
    }

    // ════════════════════════════════════════════════════════════
    // PÁGINA 5 — REGISTROS COMPLEMENTARES (somente se necessário)
    // ════════════════════════════════════════════════════════════

    const hasSupplementary =
      (cfg.ultimaAvaliacao      && extra.evolutions      && extra.evolutions.length > 0)      ||
      (cfg.agendamentos         && extra.appointments    && extra.appointments.length > 0)    ||
      (cfg.controleAtendimento  && extra.serviceRecords  && extra.serviceRecords.length > 0)  ||
      (cfg.documentosGerados    && extra.protocols       && extra.protocols.length > 0)       ||
      (cfg.analiseLaudo         && extra.documents       && extra.documents.some((d: any) => d.type === 'Laudo' || d.type === 'Relatorio')) ||
      (cfg.fichasComplementares && extra.obsForms        && extra.obsForms.length > 0);

    if (hasSupplementary) {
      doc.addPage();
      y = fichaHeader();

      // ── XI. AVALIAÇÃO COGNITIVA E FUNCIONAL ───────────────────
      if (cfg.ultimaAvaliacao && extra.evolutions && extra.evolutions.length > 0) {
        const ev     = extra.evolutions[0];
        const scores: number[] = ev.scores || [];
        const CRITERIA_NAMES = [
          'Comunicação Expressiva', 'Interação Social', 'Autonomia (AVD)', 'Autorregulação',
          'Atenção Sustentada', 'Compreensão', 'Motricidade Fina', 'Motricidade Grossa',
          'Participação', 'Linguagem/Leitura',
        ];

        if (y > fichaBottom(H) - 60) { doc.addPage(); y = fichaHeader(); }
        y = fichaSection(doc, 'XI. Avaliação Cognitiva e Funcional', FL, y, maxW);

        // Card de resumo
        const avg      = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
        const avgRound = Math.round(avg * 10) / 10;
        const avgPct   = Math.round((avg / 5) * 100);
        const resumoH  = 36;

        sf(doc, BRAND_LIGHT); sdd(doc, BRAND);
        doc.setLineWidth(0.4);
        doc.roundedRect(FL, y, maxW, resumoH, 3, 3, 'FD');
        sf(doc, BRAND);
        doc.rect(FL, y, maxW, 6, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(F_SMALL_SIZE);
        sc(doc, WHITE);
        doc.text('RESUMO DA AVALIAÇÃO', FL + 4, y + 4.5);

        const ry = y + 10;
        const evDate = ev.date ? new Date(ev.date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }) : '—';
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(F_SMALL_SIZE);
        sc(doc, GRAY);
        doc.text(`Avaliação: ${evDate}  ·  Profissional: ${ev.author || '—'}`, FL + 4, ry);

        const avgColor = avgRound >= 4 ? [22, 163, 74] : avgRound >= 3 ? [31, 78, 95] : avgRound >= 2 ? [217, 119, 6] : [220, 38, 38];
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(F_SMALL_SIZE + 1);
        sc(doc, avgColor as [number,number,number]);
        doc.text(`Média geral: ${avgRound}/5  (${avgPct}%)`, FL + 4, ry + 7);
        sf(doc, BORDER as [number,number,number]);
        doc.rect(FL + 4, ry + 9, 60, 3, 'F');
        sf(doc, avgColor as [number,number,number]);
        doc.rect(FL + 4, ry + 9, 60 * (avg / 5), 3, 'F');

        const strong   = CRITERIA_NAMES.filter((_, i) => (scores[i] ?? 0) >= 4).slice(0, 3);
        const priority = CRITERIA_NAMES.filter((_, i) => (scores[i] ?? 0) <= 2).slice(0, 3);
        const colMidX  = FL + maxW / 2 + 2;

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(F_SMALL_SIZE - 0.5);
        sc(doc, [22, 163, 74] as [number,number,number]);
        doc.text('ÁREAS FORTES', FL + 4, ry + 17);
        doc.setFont('helvetica', 'normal');
        sc(doc, DARK);
        if (strong.length > 0) {
          strong.forEach((s, i) => doc.text(`• ${s}`, FL + 4, ry + 22 + i * 4.5));
        } else {
          doc.text('— Nenhuma destacada', FL + 4, ry + 22);
        }

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(F_SMALL_SIZE - 0.5);
        sc(doc, [217, 119, 6] as [number,number,number]);
        doc.text('ÁREAS PRIORITÁRIAS', colMidX, ry + 17);
        doc.setFont('helvetica', 'normal');
        sc(doc, DARK);
        if (priority.length > 0) {
          priority.forEach((s, i) => doc.text(`• ${s}`, colMidX, ry + 22 + i * 4.5));
        } else {
          doc.text('— Todas em nível adequado', colMidX, ry + 22);
        }

        y += resumoH + 5;

        // Radar + pontuações
        if (y > fichaBottom(H) - 75) { doc.addPage(); y = fichaHeader(); }
        const criteriaForChart = CRITERIA_NAMES.map(name => ({ name }));
        try {
          const radarB64 = await generateRadarCanvas(scores, criteriaForChart);
          const radarSz  = 62;
          doc.addImage(radarB64, 'PNG', FL, y, radarSz, radarSz);

          const legendX = FL + radarSz + 6;
          const legendW = W - FR - legendX - 2;
          const barW    = Math.min(36, legendW * 0.45);
          let ly = y + 2;

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(F_SMALL_SIZE);
          sc(doc, DARK);
          doc.text('Pontuação por Dimensão', legendX, ly);
          ly += 6;

          CRITERIA_NAMES.forEach((name, i) => {
            const score  = scores[i] ?? 0;
            const sColor = score >= 4 ? [22, 163, 74] : score >= 3 ? [31, 78, 95] : score >= 2 ? [217, 119, 6] : [220, 38, 38];
            const abbrev = doc.splitTextToSize(name, legendW - barW - 14)[0] || name;
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(F_SMALL_SIZE - 1);
            sc(doc, DARK);
            doc.text(abbrev, legendX, ly);
            sf(doc, BORDER as [number,number,number]);
            doc.rect(legendX, ly + 1, barW, 3, 'F');
            sf(doc, sColor as [number,number,number]);
            doc.rect(legendX, ly + 1, barW * (score / 5), 3, 'F');
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(F_SMALL_SIZE - 1);
            sc(doc, sColor as [number,number,number]);
            doc.text(`${score}/5`, legendX + barW + 2, ly + 3.5);
            ly += 6.5;
          });
          y = Math.max(y + radarSz + 5, ly + 3);
        } catch {
          CRITERIA_NAMES.forEach((name, i) => {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(F_BODY_SIZE);
            sc(doc, DARK);
            doc.text(`${name}: ${scores[i] ?? '—'}/5`, FL, y);
            y += F_LINE_H;
          });
          y += 4;
        }

        // Parecer descritivo
        if (ev.observation) {
          if (y > fichaBottom(H) - 40) { doc.addPage(); y = fichaHeader(); }
          sf(doc, BRAND);
          doc.rect(FL, y, maxW, 8, 'F');
          sf(doc, GOLD);
          doc.rect(FL, y + 8, maxW, 1.2, 'F');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(F_SMALL_SIZE + 0.5);
          sc(doc, WHITE);
          doc.text('PARECER DESCRITIVO', FL + 4, y + 5.5);
          y += 12;

          const paragraphs = (ev.observation as string).split(/\n{2,}|\r\n{2,}/).filter(Boolean);
          for (const para of paragraphs) {
            if (y > fichaBottom(H) - 20) { doc.addPage(); y = fichaHeader(); }
            const trimmed  = para.trim();
            const isHead   = trimmed.length < 60 && (/^[A-ZÁÉÍÓÚÀÂÊÔ].{0,58}:$/.test(trimmed) || trimmed === trimmed.toUpperCase());
            if (isHead) {
              doc.setFont('helvetica', 'bold');
              doc.setFontSize(F_BODY_SIZE);
              sc(doc, BRAND);
            } else {
              doc.setFont('helvetica', 'normal');
              doc.setFontSize(F_BODY_SIZE);
              sc(doc, DARK);
            }
            const lines = doc.splitTextToSize(trimmed, maxW - 4);
            doc.text(lines, FL + 2, y);
            y += lines.length * F_LINE_H + 3;
          }
          y += 4;
        }
      }

      // ── XII. AGENDAMENTOS ────────────────────────────────────
      if (cfg.agendamentos && extra.appointments && extra.appointments.length > 0) {
        if (y > fichaBottom(H) - 45) { doc.addPage(); y = fichaHeader(); }
        y = fichaSection(doc, 'XII. Agendamentos', FL, y, maxW);

        const cols = { data: 22, hora: 18, titulo: 50, tipo: 28, prof: 28, status: maxW - 22 - 18 - 50 - 28 - 28 };
        sf(doc, BRAND_LIGHT); doc.rect(FL, y, maxW, 7, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(F_TABLE_SIZE - 0.5);
        sc(doc, BRAND);
        let cx = FL + 2;
        ['DATA', 'HORA', 'TÍTULO', 'TIPO', 'PROFISSIONAL', 'STATUS'].forEach((h, i) => {
          const w = [cols.data, cols.hora, cols.titulo, cols.tipo, cols.prof, cols.status][i];
          doc.text(h, cx, y + 5); cx += w;
        });
        y += 8;

        for (const a of extra.appointments) {
          if (y > fichaBottom(H) - 12) { doc.addPage(); y = fichaHeader(); }
          const ds = a.date ? new Date(a.date + 'T00:00:00').toLocaleDateString('pt-BR') : '—';
          const stColor: Record<string, number[]> = { realizado: [22, 163, 74], cancelado: [220, 38, 38], falta: [217, 119, 6] };
          const sCol = stColor[a.status] || [31, 78, 95];
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(F_TABLE_SIZE - 1);
          sc(doc, DARK);
          cx = FL + 2;
          [ds, a.time || '—', (a.title || '').substring(0, 28), (a.type || '—').substring(0, 16), (a.professional || '—').substring(0, 16)].forEach((val, i) => {
            const w = [cols.data, cols.hora, cols.titulo, cols.tipo, cols.prof][i];
            doc.text(val, cx, y + 4); cx += w;
          });
          doc.setFont('helvetica', 'bold');
          sc(doc, sCol as [number,number,number]);
          doc.text((a.status || 'agendado').toUpperCase(), cx, y + 4);
          sdd(doc, BORDER); doc.setLineWidth(0.2);
          doc.line(FL, y + 6.5, FL + maxW, y + 6.5);
          y += 7.5;
        }
        y += 4;
      }

      // ── XIII. CONTROLE DE ATENDIMENTO ─────────────────────────
      if (cfg.controleAtendimento && extra.serviceRecords && extra.serviceRecords.length > 0) {
        if (y > fichaBottom(H) - 45) { doc.addPage(); y = fichaHeader(); }
        y = fichaSection(doc, 'XIII. Controle de Atendimento', FL, y, maxW);

        const total    = extra.serviceRecords.length;
        const presente = extra.serviceRecords.filter((r: any) => r.attendance === 'Presente').length;
        const taxa     = total > 0 ? Math.round((presente / total) * 100) : 0;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(F_SMALL_SIZE);
        sc(doc, GRAY);
        doc.text(`${total} atendimento(s) · Presença: ${taxa}%`, FL, y);
        sf(doc, BORDER);
        doc.rect(FL, y + 3, 60, 3, 'F');
        sf(doc, [22, 163, 74] as [number,number,number]);
        doc.rect(FL, y + 3, 60 * (taxa / 100), 3, 'F');
        y += 10;

        const scCols = { data: 24, hora: 18, tipo: 32, prof: 36, pres: 20, obs: maxW - 24 - 18 - 32 - 36 - 20 };
        sf(doc, BRAND_LIGHT); doc.rect(FL, y, maxW, 7, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(F_TABLE_SIZE - 0.5);
        sc(doc, BRAND);
        let scx = FL + 2;
        ['DATA', 'HORA', 'TIPO', 'PROFISSIONAL', 'PRESENÇA', 'OBSERVAÇÕES'].forEach((h, i) => {
          const w = [scCols.data, scCols.hora, scCols.tipo, scCols.prof, scCols.pres, scCols.obs][i];
          doc.text(h, scx, y + 5); scx += w;
        });
        y += 8;

        for (const r of extra.serviceRecords.slice(0, 30)) {
          if (y > fichaBottom(H) - 12) { doc.addPage(); y = fichaHeader(); }
          const ds = r.date ? new Date(r.date).toLocaleDateString('pt-BR') : '—';
          const presColor = r.attendance === 'Presente' ? [22, 163, 74] : r.attendance === 'Falta' ? [220, 38, 38] : [108, 117, 125];
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(F_TABLE_SIZE - 1);
          sc(doc, DARK);
          scx = FL + 2;
          [ds, r.time || '—', (r.type || '—').substring(0, 18), (r.professional || '—').substring(0, 20)].forEach((val, i) => {
            const w = [scCols.data, scCols.hora, scCols.tipo, scCols.prof][i];
            doc.text(val, scx, y + 4); scx += w;
          });
          doc.setFont('helvetica', 'bold');
          sc(doc, presColor as [number,number,number]);
          doc.text(r.attendance || '—', scx, y + 4);
          scx += scCols.pres;
          doc.setFont('helvetica', 'normal');
          sc(doc, GRAY);
          doc.text((r.observations || '').substring(0, 30), scx, y + 4);
          sdd(doc, BORDER); doc.setLineWidth(0.2);
          doc.line(FL, y + 6.5, FL + maxW, y + 6.5);
          y += 7.5;
        }
        if (extra.serviceRecords.length > 30) {
          doc.setFont('helvetica', 'italic');
          doc.setFontSize(F_TABLE_SIZE - 1);
          sc(doc, GRAY);
          doc.text(`… e mais ${extra.serviceRecords.length - 30} registros`, FL, y + 3);
          y += 6;
        }
        y += 4;
      }

      // ── XIV. DOCUMENTOS PEDAGÓGICOS GERADOS ───────────────────
      if (cfg.documentosGerados && extra.protocols && extra.protocols.length > 0) {
        if (y > fichaBottom(H) - 40) { doc.addPage(); y = fichaHeader(); }
        y = fichaSection(doc, 'XIV. Documentos Pedagógicos Gerados', FL, y, maxW);

        for (const p of extra.protocols) {
          if (y > fichaBottom(H) - 12) { doc.addPage(); y = fichaHeader(); }
          const ds     = p.createdAt ? new Date(p.createdAt).toLocaleDateString('pt-BR') : '—';
          const status = p.status === 'FINAL' ? 'Concluído' : 'Rascunho';
          const sCol   = p.status === 'FINAL' ? [22, 163, 74] : [108, 117, 125];
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(F_SMALL_SIZE);
          sc(doc, DARK);
          doc.text(`• ${p.title || p.doc_type || 'Documento'}`, FL + 2, y + 4);
          doc.setFont('helvetica', 'normal');
          sc(doc, GRAY);
          doc.text(`${ds} · por ${p.generatedBy || 'Sistema'}`, FL + 8, y + 9);
          doc.setFont('helvetica', 'bold');
          sc(doc, sCol as [number,number,number]);
          doc.text(status, W - FR - 20, y + 4);
          sdd(doc, BORDER); doc.setLineWidth(0.2);
          doc.line(FL, y + 11, FL + maxW, y + 11);
          y += 13;
        }
        y += 3;
      }

      // ── XV. LAUDOS E DOCUMENTOS CLÍNICOS ANEXADOS ─────────────
      if (cfg.analiseLaudo && extra.documents && extra.documents.length > 0) {
        const docsWithAnalysis = extra.documents.filter((d: any) => d.type === 'Laudo' || d.type === 'Relatorio');
        if (docsWithAnalysis.length > 0) {
          if (y > fichaBottom(H) - 35) { doc.addPage(); y = fichaHeader(); }
          y = fichaSection(doc, 'XV. Laudos e Documentos Clínicos Anexados', FL, y, maxW);

          for (const d of docsWithAnalysis) {
            if (y > fichaBottom(H) - 12) { doc.addPage(); y = fichaHeader(); }
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(F_SMALL_SIZE);
            sc(doc, DARK);
            doc.text(`• ${d.name}`, FL + 2, y + 4);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(F_TABLE_SIZE - 1);
            sc(doc, GRAY);
            doc.text(`${d.date || '—'} · Tipo: ${d.type}`, FL + 8, y + 9);
            sdd(doc, BORDER); doc.setLineWidth(0.2);
            doc.line(FL, y + 11, FL + maxW, y + 11);
            y += 13;
          }
          y += 3;
        }
      }

      // ── XVI. FICHAS DE OBSERVAÇÃO ─────────────────────────────
      if (cfg.fichasComplementares && extra.obsForms && extra.obsForms.length > 0) {
        if (y > fichaBottom(H) - 40) { doc.addPage(); y = fichaHeader(); }
        y = fichaSection(doc, 'XVI. Fichas de Observação Complementar', FL, y, maxW);

        for (const f of extra.obsForms.slice(0, 10)) {
          if (y > fichaBottom(H) - 12) { doc.addPage(); y = fichaHeader(); }
          const ds = f.created_at ? new Date(f.created_at).toLocaleDateString('pt-BR') : '—';
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(F_SMALL_SIZE);
          sc(doc, DARK);
          doc.text(`• ${f.title || f.ficha_type || 'Ficha de Observação'}`, FL + 2, y + 4);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(F_TABLE_SIZE - 1);
          sc(doc, GRAY);
          doc.text(`${ds} · ${f.professional_name || f.created_by || 'Profissional'}`, FL + 8, y + 9);
          sdd(doc, BORDER); doc.setLineWidth(0.2);
          doc.line(FL, y + 11, FL + maxW, y + 11);
          y += 13;
        }
        if (extra.obsForms.length > 10) {
          doc.setFont('helvetica', 'italic');
          doc.setFontSize(F_TABLE_SIZE - 1);
          sc(doc, GRAY);
          doc.text(`… e mais ${extra.obsForms.length - 10} fichas`, FL, y + 2);
          y += 6;
        }
        y += 3;
      }
    }

    // ════════════════════════════════════════════════════════════
    // ASSINATURAS (sempre ao final)
    // ════════════════════════════════════════════════════════════
    if (y > fichaBottom(H) - 42) { doc.addPage(); y = fichaHeader(); }
    y += 6;
    sf(doc, BRAND); doc.rect(FL, y, maxW, 8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(F_SECTION_SIZE);
    sc(doc, WHITE);
    doc.text('ASSINATURAS E VALIDAÇÃO INSTITUCIONAL', FL + 4, y + 5.5);
    y += 14;

    doc.setFont('helvetica', 'italic');
    doc.setFontSize(F_BODY_SIZE - 0.5);
    sc(doc, GRAY);
    const decl = 'Declaramos ciência e concordância com as informações pedagógicas registradas nesta ficha, comprometendo-nos a utilizá-las exclusivamente para fins educacionais e de suporte ao aluno.';
    const declLs: string[] = doc.splitTextToSize(decl, maxW);
    doc.text(declLs, FL, y);
    y += declLs.length * F_LINE_H + 12;

    const sigFields = ['Professor(a) Regente', 'Professor(a) AEE', 'Coordenação Pedagógica', 'Responsável Legal'];
    const sigW = maxW / 4;
    sigFields.forEach((sig, i) => {
      const sx = FL + i * sigW;
      sdd(doc, GRAY);
      doc.setLineWidth(0.3);
      doc.line(sx, y + 12, sx + sigW - 4, y + 12);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(F_TABLE_SIZE);
      sc(doc, GRAY);
      doc.text(sig, sx + (sigW - 4) / 2, y + 17, { align: 'center' });
    });
    y += 26;

    // Nota discreta sobre o código interno (não é validação pública)
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(F_TINY_SIZE);
    sc(doc, GRAY);
    doc.text(`Código do documento: ${internalCode}  ·  Emitido em: ${new Date().toLocaleDateString('pt-BR')}`, FL, y);
    doc.text('Documento pedagógico para uso interno. Não contém link de validação pública.', FL, y + 4);

    // ── RODAPÉ EM TODAS AS PÁGINAS ────────────────────────────
    addFichaFooterAllPages(doc, internalCode, emittedBy);
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
    const auditCode = existingCode || makeAuditCode('EVO', student.id + Date.now());

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

    const qrDataUrl = await buildQrDataUrl(auditCode);
    addFooterAllPages(doc, auditCode, createdBy, qrDataUrl);
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
};
