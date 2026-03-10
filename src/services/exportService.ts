// exportService.ts — PDF ABNT-compliant com jsPDF (sem window.print)
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

// ─── Cores da marca ────────────────────────────────────────────────────────────
const BRAND = { r: 88, g: 28, b: 235 };
const BRAND_LIGHT = { r: 237, g: 233, b: 254 };
const DARK = { r: 17, g: 24, b: 39 };
const GRAY = { r: 107, g: 114, b: 128 };

// ─── Padrão ABNT NBR 14724 ────────────────────────────────────────────────────
// A4: 210 × 297 mm
// Margens: esquerda 30mm | direita 20mm | superior 30mm | inferior 20mm
const ML = 30;           // margem esquerda: 3 cm
const MR = 20;           // margem direita: 2 cm
const CONTENT_TOP = 30;  // início do conteúdo sem cabeçalho institucional
const CONTENT_TOP_INST = 50; // início do conteúdo COM cabeçalho institucional
const FOOTER_H = 16;     // altura do rodapé em mm
const BOTTOM_MARGIN = 20; // margem inferior: 2 cm

// Limite inferior seguro para conteúdo (antes do rodapé + margem inferior)
function contentBottom(H: number): number {
  return H - BOTTOM_MARGIN - FOOTER_H;
}

// Tamanhos de fonte ABNT
const BODY_SIZE = 12;    // corpo do texto: 12pt (ABNT)
const LABEL_SIZE = 10;   // rótulos e subtítulos: 10pt
const SMALL_SIZE = 8;    // notas e auxiliares: 8pt
const LINE_H = 6.5;      // espaçamento 1,5 para fonte 12pt em mm

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function buildQrDataUrl(auditCode: string): Promise<string | undefined> {
  try {
    const origin = (typeof window !== 'undefined' && window.location?.origin)
      ? window.location.origin
      : 'https://incluiai.com';
    const url = `${origin}/validar/${auditCode}`;
    return await QRCode.toDataURL(url, { margin: 0, width: 256 });
  } catch (e) {
    console.warn('QR Code generation failed', e);
    return undefined;
  }
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
  doc: any,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number
): number {
  const lines = doc.splitTextToSize(text || "—", maxWidth);
  doc.text(lines, x, y);
  return y + lines.length * lineHeight;
}

// ─── Cabeçalho institucional + do documento ───────────────────────────────────
// Se school for fornecida (com nome), renderiza cabeçalho institucional completo
// Retorna o Y onde o conteúdo deve começar
function addDocHeader(
  doc: any,
  title: string,
  subtitle: string,
  studentName: string,
  auditCode: string,
  school?: SchoolConfig | null
): number {
  const W = doc.internal.pageSize.getWidth(); // 210mm

  const hasSchool = !!(school?.schoolName?.trim());

  if (hasSchool) {
    // ── CABEÇALHO INSTITUCIONAL (0–38mm) ─────────────────────────────────────

    // Faixa roxa — 0 a 20mm
    doc.setFillColor(BRAND.r, BRAND.g, BRAND.b);
    doc.rect(0, 0, W, 20, "F");

    // Logo da escola (se houver, data URL base64)
    const logoUrl = school!.logoUrl;
    const logoW = 16, logoH = 16;
    const logoX = ML;
    const logoY = 2;
    if (logoUrl && logoUrl.startsWith("data:")) {
      try {
        const fmt = logoUrl.includes("png") ? "PNG" : "JPEG";
        doc.addImage(logoUrl, fmt, logoX, logoY, logoW, logoH);
      } catch {}
    }

    // Nome da escola (destaque)
    const textX = logoUrl && logoUrl.startsWith("data:") ? ML + logoW + 3 : ML;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(255, 255, 255);
    doc.text(school!.schoolName.toUpperCase(), textX, 9);

    // Cidade/Estado + CNPJ/INEP (linha menor abaixo do nome)
    const locParts = [school!.city, school!.state].filter(Boolean).join(" – ");
    const idParts = [
      school!.cnpj ? `CNPJ: ${school!.cnpj}` : "",
      school!.inepCode ? `INEP: ${school!.inepCode}` : "",
    ].filter(Boolean).join("  |  ");
    const infoLine = [locParts, idParts].filter(Boolean).join("     ");

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(220, 210, 255);
    if (infoLine) doc.text(infoLine, textX, 16);

    // Tipo do documento (direita)
    doc.setFont("helvetica", "bold");
    doc.setFontSize(LABEL_SIZE);
    doc.setTextColor(255, 255, 255);
    doc.text(title, W - MR, 8, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(SMALL_SIZE);
    doc.text(subtitle, W - MR, 15, { align: "right" });

    // Faixa cinza com dados de contato — 20 a 32mm
    doc.setFillColor(248, 250, 252);
    doc.rect(0, 20, W, 12, "F");

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(GRAY.r, GRAY.g, GRAY.b);

    const addrParts = [
      school!.address,
      school!.neighborhood,
      school!.city && school!.state ? `${school!.city}/${school!.state}` : (school!.city || school!.state),
      school!.zipcode ? `CEP ${school!.zipcode}` : "",
    ].filter(Boolean);
    const contactParts = [
      school!.email,
      school!.instagram ? `@${school!.instagram.replace(/^@/, "")}` : "",
      school!.contact,
    ].filter(Boolean);

    if (addrParts.length) doc.text(addrParts.join("  ·  "), ML, 26);
    if (contactParts.length) doc.text(contactParts.join("  ·  "), ML, 30);

    // Gestor/Diretor (direita da faixa cinza)
    const resp = [
      school!.principalName ? `Diretor(a): ${school!.principalName}` : "",
      school!.managerName ? `Gestor(a): ${school!.managerName}` : "",
    ].filter(Boolean).join("   ");
    if (resp) doc.text(resp, W - MR, 27, { align: "right" });

    // Faixa azul-clara com nome do aluno — 32 a 40mm
    doc.setFillColor(237, 233, 254);
    doc.rect(0, 32, W, 8, "F");

    doc.setTextColor(DARK.r, DARK.g, DARK.b);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(LABEL_SIZE);
    doc.text(`Aluno(a): ${studentName}`, ML, 38);

    doc.setFont("courier", "normal");
    doc.setFontSize(7);
    doc.setTextColor(GRAY.r, GRAY.g, GRAY.b);
    doc.text(`Código: ${auditCode}`, W - MR, 38, { align: "right" });

    // Linha divisória — 40mm
    doc.setDrawColor(BRAND.r, BRAND.g, BRAND.b);
    doc.setLineWidth(0.4);
    doc.line(0, 40, W, 40);

    return CONTENT_TOP_INST; // 50mm

  } else {
    // ── CABEÇALHO PADRÃO IncluiAI (sem escola cadastrada) ──────────────────

    // Faixa roxa principal — 0 a 18mm
    doc.setFillColor(BRAND.r, BRAND.g, BRAND.b);
    doc.rect(0, 0, W, 18, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(255, 255, 255);
    doc.text("IncluiAI", ML, 11);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text("Plataforma Educacional Inclusiva", ML + 22, 11);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(LABEL_SIZE);
    doc.text(title, W - MR, 8, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(SMALL_SIZE);
    doc.text(subtitle, W - MR, 15, { align: "right" });

    // Faixa clara com nome do aluno — 18mm a 26mm
    doc.setFillColor(248, 250, 252);
    doc.rect(0, 18, W, 8, "F");

    doc.setTextColor(DARK.r, DARK.g, DARK.b);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(LABEL_SIZE);
    doc.text(studentName, ML, 24);

    doc.setFont("courier", "normal");
    doc.setFontSize(7);
    doc.setTextColor(GRAY.r, GRAY.g, GRAY.b);
    doc.text(`Código: ${auditCode}`, W - MR, 24, { align: "right" });

    // Linha divisória — 26mm
    doc.setDrawColor(BRAND.r, BRAND.g, BRAND.b);
    doc.setLineWidth(0.4);
    doc.line(0, 26, W, 26);

    return CONTENT_TOP; // 30mm
  }
}

// ─── Rodapé do documento (dentro da margem inferior de 20mm) ─────────────────
function addDocFooter(doc: any, auditCode: string, emittedBy: string, qrDataUrl?: string) {
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight(); // 297mm

  const footerY = H - FOOTER_H;

  // Linha divisória do rodapé
  doc.setDrawColor(BRAND.r, BRAND.g, BRAND.b);
  doc.setLineWidth(0.3);
  doc.line(ML, footerY, W - MR, footerY);

  doc.setFillColor(248, 250, 252);
  doc.rect(0, footerY, W, FOOTER_H, "F");

  // Usar toLocaleString (suporta hora+minuto corretamente, ao contrário de toLocaleDateString)
  const dateStr = new Date().toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  // QR Code no canto direito do rodapé (14×14 mm)
  const qrSize = 14;
  if (qrDataUrl) {
    try {
      doc.addImage(qrDataUrl, "PNG", W - MR - qrSize, footerY + 1, qrSize, qrSize);
    } catch {}
  }

  // Largura de texto disponível (reserva espaço para o QR se presente)
  const textRight = qrDataUrl ? W - MR - qrSize - 2 : W - MR;
  const centerX = ML + (textRight - ML) / 2;

  // Linha 1 — data/autor (esquerda) | código auditável (centro)
  doc.setFont("helvetica", "normal");
  doc.setFontSize(SMALL_SIZE);
  doc.setTextColor(GRAY.r, GRAY.g, GRAY.b);
  doc.text(`Gerado em ${dateStr} por ${emittedBy}`, ML, footerY + 6);

  doc.setFont("courier", "bold");
  doc.setFontSize(SMALL_SIZE);
  doc.text(`Cód.: ${auditCode}`, centerX, footerY + 6, { align: "center" });

  // Linha 2 — link de validação (esquerda) | página (centro)
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);
  doc.setTextColor(BRAND.r, BRAND.g, BRAND.b);
  doc.text("incluiai.com/validar/" + auditCode, ML, footerY + 12);

  doc.setTextColor(GRAY.r, GRAY.g, GRAY.b);
  doc.setFontSize(SMALL_SIZE);
  doc.text(
    `Página ${doc.internal.getCurrentPageInfo().pageNumber} de ${doc.internal.getNumberOfPages()}`,
    centerX,
    footerY + 12,
    { align: "center" }
  );
}

function addFooterAllPages(doc: any, auditCode: string, emittedBy: string, qrDataUrl?: string) {
  const pages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    addDocFooter(doc, auditCode, emittedBy, qrDataUrl);
  }
}

// ─── Título de seção no estilo ABNT ───────────────────────────────────────────
// Faixa colorida com texto em branco negrito (identifica a seção)
function addSectionTitle(
  doc: any,
  title: string,
  x: number,
  y: number,
  w: number
): number {
  doc.setFillColor(BRAND.r, BRAND.g, BRAND.b);
  doc.rect(x, y, w, 7, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(SMALL_SIZE);
  doc.setTextColor(255, 255, 255);
  doc.text(title, x + 3, y + 5);
  return y + 10;
}

// ─── Renderiza campo com quebra de página automática ─────────────────────────
// onNewPage: callback chamado ao criar nova página (adiciona cabeçalho)
function renderField(
  doc: any,
  label: string,
  value: string,
  x: number,
  y: number,
  maxW: number,
  lineH = LINE_H,
  onNewPage?: () => void
): number {
  const H = doc.internal.pageSize.getHeight();

  // Quebra de página: garante ao menos 25mm antes do rodapé
  if (y > contentBottom(H) - 20) {
    doc.addPage();
    const newTop = onNewPage ? onNewPage() : undefined;
    y = typeof newTop === 'number' ? newTop : CONTENT_TOP;
  }

  if (label) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(LABEL_SIZE);
    doc.setTextColor(BRAND.r, BRAND.g, BRAND.b);
    doc.text(label.toUpperCase(), x, y);
    y += 5;
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(BODY_SIZE);
  doc.setTextColor(DARK.r, DARK.g, DARK.b);
  y = addWrappedText(doc, value || "—", x, y, maxW, lineH);
  return y + 4;
}

// ─── CANVAS HELPERS ────────────────────────────────────────────────────────────
async function generateRadarCanvas(
  scores: number[],
  criteria: { name: string }[]
): Promise<string> {
  const size = 480;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, size, size);

  const cx = size / 2, cy = size / 2, r = 180;
  const n = criteria.length;
  const step = (Math.PI * 2) / n;

  ctx.strokeStyle = "#e5e7eb";
  ctx.lineWidth = 1;
  [0.2, 0.4, 0.6, 0.8, 1].forEach(scale => {
    ctx.beginPath();
    ctx.arc(cx, cy, r * scale, 0, Math.PI * 2);
    ctx.stroke();
  });

  criteria.forEach((_, i) => {
    const angle = i * step - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + r * Math.cos(angle), cy + r * Math.sin(angle));
    ctx.strokeStyle = "#e5e7eb";
    ctx.lineWidth = 1;
    ctx.stroke();

    const lx = cx + (r + 24) * Math.cos(angle);
    const ly = cy + (r + 24) * Math.sin(angle);
    ctx.font = "bold 11px Arial";
    ctx.fillStyle = "#374151";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(criteria[i].name.split(" ")[0], lx, ly);
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
  ctx.fillStyle = "rgba(88, 28, 235, 0.18)";
  ctx.fill();
  ctx.strokeStyle = "rgba(88, 28, 235, 0.85)";
  ctx.lineWidth = 2.5;
  ctx.stroke();

  scores.forEach((val, i) => {
    const angle = i * step - Math.PI / 2;
    const rv = (val / 5) * r;
    ctx.beginPath();
    ctx.arc(cx + rv * Math.cos(angle), cy + rv * Math.sin(angle), 5, 0, Math.PI * 2);
    ctx.fillStyle = "rgb(88, 28, 235)";
    ctx.fill();
  });

  return canvas.toDataURL("image/png");
}

async function generateBarCanvas(
  scores: number[],
  criteria: { name: string }[]
): Promise<string> {
  const W = 900, H = 340;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#f9fafb";
  ctx.fillRect(0, 0, W, H);
  const pad = { l: 40, r: 20, t: 20, b: 60 };
  const chartW = W - pad.l - pad.r;
  const chartH = H - pad.t - pad.b;
  const barW = chartW / scores.length - 8;

  [1, 2, 3, 4, 5].forEach(v => {
    const gy = pad.t + chartH - (v / 5) * chartH;
    ctx.beginPath();
    ctx.moveTo(pad.l, gy);
    ctx.lineTo(W - pad.r, gy);
    ctx.strokeStyle = "#e5e7eb";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.font = "11px Arial";
    ctx.fillStyle = "#9ca3af";
    ctx.textAlign = "right";
    ctx.fillText(String(v), pad.l - 4, gy + 4);
  });

  scores.forEach((val, i) => {
    const x = pad.l + i * (chartW / scores.length) + 4;
    const barH = (val / 5) * chartH;
    const y = pad.t + chartH - barH;

    const grad = ctx.createLinearGradient(x, y, x, pad.t + chartH);
    grad.addColorStop(0, "rgba(88, 28, 235, 0.9)");
    grad.addColorStop(1, "rgba(167, 139, 250, 0.7)");
    ctx.fillStyle = grad;
    (ctx as any).roundRect
      ? (ctx as any).roundRect(x, y, barW, barH, [4, 4, 0, 0])
      : ctx.rect(x, y, barW, barH);
    ctx.fill();

    ctx.font = "bold 13px Arial";
    ctx.fillStyle = "#1f2937";
    ctx.textAlign = "center";
    ctx.fillText(String(val), x + barW / 2, y - 6);

    const label = criteria[i].name.split(" ").slice(0, 2).join(" ");
    ctx.font = "10px Arial";
    ctx.fillStyle = "#6b7280";
    ctx.fillText(label, x + barW / 2, pad.t + chartH + 18);
  });

  return canvas.toDataURL("image/png");
}

async function generateLineCanvas(
  evolutions: StudentEvolution[],
  criteria: { name: string }[]
): Promise<string> {
  if (evolutions.length < 2) return "";
  const W = 900, H = 300;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#f9fafb";
  ctx.fillRect(0, 0, W, H);
  const pad = { l: 40, r: 20, t: 20, b: 50 };
  const chartW = W - pad.l - pad.r;
  const chartH = H - pad.t - pad.b;

  const sorted = [...evolutions].sort(
    (a, b) =>
      new Date((a as any).date || (a as any).createdAt || "").getTime() -
      new Date((b as any).date || (b as any).createdAt || "").getTime()
  );

  const colors = ["#5b21b6", "#7c3aed", "#a78bfa", "#c4b5fd", "#2563eb"];

  [1, 2, 3, 4, 5].forEach(v => {
    const gy = pad.t + chartH - ((v - 1) / 4) * chartH;
    ctx.beginPath();
    ctx.moveTo(pad.l, gy);
    ctx.lineTo(W - pad.r, gy);
    ctx.strokeStyle = "#e5e7eb";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.font = "11px Arial";
    ctx.fillStyle = "#9ca3af";
    ctx.textAlign = "right";
    ctx.fillText(String(v), pad.l - 4, gy + 4);
  });

  sorted.forEach((ev, i) => {
    const x = pad.l + (i / (sorted.length - 1)) * chartW;
    const d = new Date((ev as any).date || (ev as any).createdAt || "");
    const label = isNaN(d.getTime())
      ? `#${i + 1}`
      : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
    ctx.font = "9px Arial";
    ctx.fillStyle = "#6b7280";
    ctx.textAlign = "center";
    ctx.fillText(label, x, pad.t + chartH + 15);
  });

  criteria.slice(0, 5).forEach((c, ci) => {
    ctx.beginPath();
    ctx.strokeStyle = colors[ci];
    ctx.lineWidth = 2;
    sorted.forEach((ev, i) => {
      const val = ev.scores?.[ci] ?? 1;
      const x = pad.l + (i / Math.max(1, sorted.length - 1)) * chartW;
      const y = pad.t + chartH - ((val - 1) / 4) * chartH;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();

    const lx = pad.l + ci * (chartW / 5);
    ctx.fillStyle = colors[ci];
    ctx.fillRect(lx, pad.t + chartH + 28, 12, 8);
    ctx.font = "9px Arial";
    ctx.fillStyle = "#374151";
    ctx.textAlign = "left";
    ctx.fillText(c.name.split(" ")[0], lx + 14, pad.t + chartH + 36);
  });

  return canvas.toDataURL("image/png");
}

// ─── EXPORT SERVICE ────────────────────────────────────────────────────────────
export const ExportService = {

  // ── Ficha do Aluno ───────────────────────────────────────────────────────────
  async generateStudentProfilePDF(student: Student, emittedBy = "Sistema", school?: SchoolConfig | null) {
    const jsPDF = await loadJsPDF();
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const W = doc.internal.pageSize.getWidth();   // 210mm
    const H = doc.internal.pageSize.getHeight();  // 297mm
    const maxW = W - ML - MR;                     // 160mm
    const auditCode = makeAuditCode("FICHA", student.id);
    const halfW = (maxW - 6) / 2;                 // ~77mm por coluna
    const col1x = ML;                             // 30mm
    const col2x = ML + halfW + 6;                 // ~113mm

    // Callback para adicionar cabeçalho em páginas de continuação
    const pageHeader = () =>
      addDocHeader(doc, "FICHA DO ALUNO", "Documentação Educacional Inclusiva", student.name, auditCode, school);

    const contentTop = pageHeader();
    let y = contentTop;

    // ── Bloco de identidade do aluno ─────────────────────────────────────────
    doc.setFillColor(BRAND_LIGHT.r, BRAND_LIGHT.g, BRAND_LIGHT.b);
    doc.roundedRect(ML, y, maxW, 42, 3, 3, "F");

    // Avatar circular com iniciais
    doc.setFillColor(BRAND.r, BRAND.g, BRAND.b);
    doc.circle(ML + 16, y + 21, 14, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(255, 255, 255);
    const initials = student.name
      .split(" ")
      .map((n: string) => n[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
    doc.text(initials, ML + 16, y + 24, { align: "center" });

    // Dados principais
    const infoX = ML + 36;
    doc.setTextColor(DARK.r, DARK.g, DARK.b);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(student.name, infoX, y + 11);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(BODY_SIZE);
    doc.setTextColor(GRAY.r, GRAY.g, GRAY.b);

    const age = student.birthDate
      ? Math.floor(
          (Date.now() - new Date(student.birthDate).getTime()) /
            (365.25 * 24 * 60 * 60 * 1000)
        )
      : "—";

    // Duas colunas de informações rápidas dentro do bloco
    const safeBirthDate = (() => {
      if (!student.birthDate) return "—";
      const d = new Date(student.birthDate + "T00:00:00");
      return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
    })();
    const col1Info = [
      `Nascimento: ${safeBirthDate}`,
      `Idade: ${age} anos  |  Gênero: ${student.gender || "—"}`,
      `Série: ${student.grade || "—"}  |  Turno: ${student.shift || "—"}`,
    ];
    const col2Info = [
      `Nível de Suporte: ${student.supportLevel || "—"}`,
      `CID: ${Array.isArray(student.cid) ? student.cid.join(", ") : student.cid || "—"}`,
      `Medicação: ${student.medication || "—"}`,
    ];

    col1Info.forEach((line, i) =>
      doc.text(line, infoX, y + 21 + i * 7)
    );
    col2Info.forEach((line, i) =>
      doc.text(line, col2x, y + 21 + i * 7)
    );
    y += 48;

    // Diagnósticos
    const diagText = (student.diagnosis || []).join(", ");
    if (diagText) {
      y = renderField(doc, "Diagnósticos", diagText, ML, y, maxW, LINE_H, pageHeader);
    }

    // ── Seção: Responsável / Equipe Pedagógica ────────────────────────────────
    if (y > contentBottom(H) - 70) { doc.addPage(); y = pageHeader(); }
    y = addSectionTitle(doc, "RESPONSÁVEL / EQUIPE PEDAGÓGICA", ML, y, maxW);

    let yL = y, yR = y;
    yL = renderField(doc, "Responsável", student.guardianName, col1x, yL, halfW, LINE_H, pageHeader);
    yL = renderField(doc, "Telefone", student.guardianPhone, col1x, yL, halfW, LINE_H, pageHeader);
    yL = renderField(doc, "E-mail", student.guardianEmail || "—", col1x, yL, halfW, LINE_H, pageHeader);
    yR = renderField(doc, "Professor Regente", student.regentTeacher, col2x, yR, halfW, LINE_H, pageHeader);
    yR = renderField(doc, "Professor AEE", student.aeeTeacher || "—", col2x, yR, halfW, LINE_H, pageHeader);
    yR = renderField(doc, "Coordenador", student.coordinator || "—", col2x, yR, halfW, LINE_H, pageHeader);
    yR = renderField(doc, "Profissionais Externos", (student.professionals || []).join(", "), col2x, yR, halfW, LINE_H, pageHeader);
    y = Math.max(yL, yR) + 4;

    // ── Seção: Contexto Escolar e Familiar ────────────────────────────────────
    if (y > contentBottom(H) - 40) { doc.addPage(); y = pageHeader(); }
    y = addSectionTitle(doc, "CONTEXTO ESCOLAR E FAMILIAR", ML, y, maxW);
    y = renderField(doc, "Histórico Escolar", student.schoolHistory, ML, y, maxW, LINE_H, pageHeader);
    y = renderField(doc, "Contexto Familiar", student.familyContext || "—", ML, y, maxW, LINE_H, pageHeader);

    // ── Seção: Perfil Funcional ───────────────────────────────────────────────
    if (y > contentBottom(H) - 40) { doc.addPage(); y = pageHeader(); }
    y = addSectionTitle(doc, "PERFIL FUNCIONAL", ML, y, maxW);

    yL = y; yR = y;
    yL = renderField(doc, "Habilidades", (student.abilities || []).map(a => `• ${a}`).join("\n"), col1x, yL, halfW, LINE_H, pageHeader);
    yL = renderField(doc, "Estratégias Eficazes", (student.strategies || []).map(s => `• ${s}`).join("\n"), col1x, yL, halfW, LINE_H, pageHeader);
    yR = renderField(doc, "Dificuldades", (student.difficulties || []).map(d => `• ${d}`).join("\n"), col2x, yR, halfW, LINE_H, pageHeader);
    yR = renderField(doc, "Comunicação", (student.communication || []).join(", "), col2x, yR, halfW, LINE_H, pageHeader);
    y = Math.max(yL, yR) + 4;

    // ── Observações Gerais ────────────────────────────────────────────────────
    if (student.observations) {
      if (y > contentBottom(H) - 40) { doc.addPage(); y = pageHeader(); }
      y = addSectionTitle(doc, "OBSERVAÇÕES GERAIS", ML, y, maxW);
      y = renderField(doc, "", student.observations, ML, y, maxW, LINE_H, pageHeader);
    }

    // ── Campos de Assinatura ──────────────────────────────────────────────────
    if (y > contentBottom(H) - 45) { doc.addPage(); y = pageHeader(); }
    y += 8;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(LABEL_SIZE);
    doc.setTextColor(DARK.r, DARK.g, DARK.b);
    doc.text("ASSINATURAS", ML, y);
    y += 8;

    const sigFields = ["Professor Regente", "Professor AEE", "Coordenação", "Responsável"];
    const sigW = maxW / 4;
    sigFields.forEach((sig, i) => {
      const sx = ML + i * sigW;
      doc.setDrawColor(GRAY.r, GRAY.g, GRAY.b);
      doc.setLineWidth(0.3);
      doc.line(sx, y + 14, sx + sigW - 4, y + 14);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(SMALL_SIZE);
      doc.setTextColor(GRAY.r, GRAY.g, GRAY.b);
      doc.text(sig, sx + (sigW - 4) / 2, y + 19, { align: "center" });
    });

    const qrDataUrl = await buildQrDataUrl(auditCode);
    addFooterAllPages(doc, auditCode, emittedBy, qrDataUrl);
    doc.save(`Ficha_${student.name.replace(/\s+/g, "_")}.pdf`);
  },

  // ── Relatório Evolutivo ───────────────────────────────────────────────────────
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
      student,
      scores,
      observation,
      criteria,
      customFields = [],
      auditCode: existingCode,
      createdBy = "Sistema",
      createdAt,
      allEvolutions = [],
      school,
    } = params;

    const jsPDF = await loadJsPDF();
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const maxW = W - ML - MR; // 160mm
    const auditCode = existingCode || makeAuditCode("EVO", student.id + Date.now());

    const pageHeader = (subtitle = "Acompanhamento de Desenvolvimento") =>
      addDocHeader(doc, "RELATÓRIO EVOLUTIVO", subtitle, student.name, auditCode, school);

    const contentTop = pageHeader();
    let y = contentTop;

    // Data e profissional responsável
    doc.setFont("helvetica", "normal");
    doc.setFontSize(BODY_SIZE);
    doc.setTextColor(GRAY.r, GRAY.g, GRAY.b);
    const _rawDate = createdAt ? new Date(createdAt) : new Date();
    const emitDate = (!isNaN(_rawDate.getTime()) ? _rawDate : new Date())
      .toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
    doc.text(`Emissão: ${emitDate}  |  Profissional: ${createdBy}`, ML, y);
    y += LINE_H + 4;

    // ── Gráfico Radar + legenda lateral ──────────────────────────────────────
    try {
      const radarB64 = await generateRadarCanvas(scores, criteria);
      const imgSize = 74;
      doc.addImage(radarB64, "PNG", ML, y, imgSize, imgSize);

      let ly = y + 4;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(BODY_SIZE);
      doc.setTextColor(DARK.r, DARK.g, DARK.b);
      doc.text("Mapa de Evolução (Radar)", ML + imgSize + 6, ly);
      ly += 8;

      criteria.forEach((c, i) => {
        const pct = Math.round((scores[i] / 5) * 100);
        // Barra mini de progresso
        doc.setFillColor(230, 230, 250);
        doc.rect(ML + imgSize + 6, ly - 3, 50, 5, "F");
        doc.setFillColor(BRAND.r, BRAND.g, BRAND.b);
        doc.rect(ML + imgSize + 6, ly - 3, 50 * (scores[i] / 5), 5, "F");

        doc.setFont("helvetica", "normal");
        doc.setFontSize(SMALL_SIZE);
        doc.setTextColor(DARK.r, DARK.g, DARK.b);
        doc.text(`${c.name}`, ML + imgSize + 6, ly + 5);
        doc.setFont("helvetica", "bold");
        doc.text(`${scores[i]}/5 (${pct}%)`, ML + imgSize + 6 + 52, ly + 5);
        ly += 8;
      });

      y += imgSize + 8;
    } catch (_) {
      // Fallback texto simples
      criteria.forEach((c, i) => {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(BODY_SIZE);
        doc.setTextColor(DARK.r, DARK.g, DARK.b);
        doc.text(`${c.name}: ${scores[i]}/5`, ML, y);
        y += LINE_H;
      });
      y += 4;
    }

    // ── Gráfico de Barras + Linha do Tempo (nova página) ─────────────────────
    // Rastreia onde o conteúdo da página 2 termina para posicionar o parecer corretamente
    let parecerStartY = contentTop;
    let parecerOnNewPage = false;

    try {
      const barB64 = await generateBarCanvas(scores, criteria);
      doc.addPage();
      const y2Start = addDocHeader(doc, "RELATÓRIO EVOLUTIVO", "Gráfico de Desempenho", student.name, auditCode, school);
      let y2 = y2Start;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(BODY_SIZE);
      doc.setTextColor(DARK.r, DARK.g, DARK.b);
      doc.text("Desempenho por Critério (Barras)", ML, y2);
      y2 += LINE_H;
      doc.addImage(barB64, "PNG", ML, y2, maxW, 64);
      y2 += 70;

      // Linha do tempo (se há mais de uma avaliação)
      if (allEvolutions.length > 1) {
        try {
          const lineB64 = await generateLineCanvas(allEvolutions, criteria);
          if (lineB64) {
            doc.setFont("helvetica", "bold");
            doc.setFontSize(BODY_SIZE);
            doc.setTextColor(DARK.r, DARK.g, DARK.b);
            doc.text("Evolução Histórica (Critérios 1–5)", ML, y2 + 4);
            y2 += LINE_H + 4;
            doc.addImage(lineB64, "PNG", ML, y2, maxW, 60);
            y2 += 66;
          }
        } catch (_) {}
      }

      parecerStartY = y2 + 6;
      parecerOnNewPage = parecerStartY > contentBottom(H) - 50;
    } catch (_) {
      // Se não há gráfico de barras, o parecer fica na mesma página do radar
      parecerStartY = y + 4;
      parecerOnNewPage = parecerStartY > contentBottom(H) - 50;
    }

    // ── Parecer Descritivo ────────────────────────────────────────────────────
    // Garante que sempre está na página correta (não usa y da página 1 para decidir)
    let yP = parecerStartY;
    if (parecerOnNewPage) {
      doc.addPage();
      addDocHeader(doc, "RELATÓRIO EVOLUTIVO", "Parecer Descritivo", student.name, auditCode);
      yP = CONTENT_TOP;
    }

    yP = addSectionTitle(doc, "PARECER DESCRITIVO", ML, yP, maxW);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(BODY_SIZE);
    doc.setTextColor(DARK.r, DARK.g, DARK.b);
    yP = addWrappedText(doc, observation || "—", ML, yP, maxW, LINE_H);
    yP += 6;

    // Campos personalizados
    const parecer_header = () =>
      addDocHeader(doc, "RELATÓRIO EVOLUTIVO", "", student.name, auditCode);

    customFields.forEach(field => {
      if (yP > contentBottom(H) - 30) {
        doc.addPage();
        parecer_header();
        yP = CONTENT_TOP;
      }
      doc.setFillColor(245, 243, 255);
      doc.roundedRect(ML, yP, maxW, 7, 2, 2, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(LABEL_SIZE);
      doc.setTextColor(BRAND.r, BRAND.g, BRAND.b);
      doc.text(field.label.toUpperCase(), ML + 3, yP + 5);
      yP += 10;

      if (field.type === "scale") {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(BODY_SIZE);
        doc.setTextColor(DARK.r, DARK.g, DARK.b);
        doc.text(`Pontuação: ${field.value} / ${field.maxScale || 5}`, ML, yP);
        yP += LINE_H + 2;
      } else {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(BODY_SIZE);
        doc.setTextColor(DARK.r, DARK.g, DARK.b);
        yP = addWrappedText(doc, String(field.value || "—"), ML, yP, maxW, LINE_H);
        yP += 4;
      }
    });

    const qrDataUrl = await buildQrDataUrl(auditCode);
    addFooterAllPages(doc, auditCode, createdBy, qrDataUrl);
    doc.save(`Relatorio_Evolutivo_${student.name.replace(/\s+/g, "_")}.pdf`);
  },

  // ── Impressão via window.print (protocolos estruturados) ─────────────────────
  // ABNT NBR 14724: margens esquerda 3cm / direita 2cm / superior 3cm / inferior 2cm
  async printToPDF(elementId: string, title: string) {
    const el = document.getElementById(elementId);
    if (!el) { window.print(); return; }

    const clone = el.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("[data-no-print]").forEach(n => n.remove());

    const overlay = document.createElement("div");
    overlay.style.cssText =
      "position:fixed;inset:0;z-index:999999;background:white;overflow:auto;";

    const style = document.createElement("style");
    style.textContent = `
      @page { size: A4 portrait; margin: 30mm 20mm 20mm 30mm; }
      html, body {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
        background: #fff;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: Arial, sans-serif;
        font-size: 12pt;
        line-height: 1.5;
        color: #111827;
      }
      .print-page { width: 160mm; margin: 0 auto; }
      h1 { font-size: 14pt; }
      h2 { font-size: 13pt; }
      h3 { font-size: 12pt; }
      h1, h2, h3 { break-after: avoid; }
      p { margin: 0 0 6pt 0; }
      @media print {
        body > *:not(#__print_overlay__) { display: none !important; }
      }
    `;

    const page = document.createElement("div");
    page.className = "print-page";
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
