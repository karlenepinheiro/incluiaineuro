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

// ─── Cores da marca (padrão IncluiAI v2) ─────────────────────────────────────
const BRAND       = { r: 31,  g: 78,  b: 95  };  // petrol #1F4E5F
const BRAND_DARK  = { r: 28,  g: 32,  b: 46  };  // dark   #1C202E
const BRAND_LIGHT = { r: 236, g: 244, b: 247 };  // petrol light
const DARK        = { r: 28,  g: 32,  b: 46  };
const GRAY        = { r: 108, g: 117, b: 125 };
const GOLD        = { r: 198, g: 146, b: 20  };  // gold  #C69214

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
    return await QRCode.toDataURL(
      `https://www.incluiai.app.br/validar/${auditCode}`,
      { margin: 0, width: 256 },
    );
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

// ─── Cabeçalho de execução (todas as páginas) — padrão IncluiAI v2 ────────────
// Linha superior: escola/sistema | código de validação + regra fina
// Retorna Y de início do conteúdo (11mm)
function addDocHeader(
  doc: any,
  title: string,
  _subtitle: string,
  _studentName: string,
  auditCode: string,
  school?: SchoolConfig | null
): number {
  const W     = doc.internal.pageSize.getWidth();
  const label = school?.schoolName?.trim() || 'Sistema IncluiAI';

  doc.setFont("helvetica", "bold");
  doc.setFontSize(SMALL_SIZE);
  doc.setTextColor(DARK.r, DARK.g, DARK.b);
  doc.text(label, ML, 6.5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(SMALL_SIZE - 0.5);
  doc.setTextColor(GRAY.r, GRAY.g, GRAY.b);
  if (title) doc.text(title, W / 2, 6.5, { align: "center" });

  doc.setFont("courier", "normal");
  doc.setFontSize(SMALL_SIZE - 0.5);
  doc.text(`Cód. Validação: ${auditCode}`, W - MR, 6.5, { align: "right" });

  doc.setDrawColor(218, 224, 229);
  doc.setLineWidth(0.3);
  doc.line(ML, 9, W - MR, 9);

  return 11; // RUN_HDR_H
}

// ─── Rodapé (padrão IncluiAI v2) ──────────────────────────────────────────────
function addDocFooter(doc: any, auditCode: string, emittedBy: string, qrDataUrl?: string) {
  const W      = doc.internal.pageSize.getWidth();
  const H      = doc.internal.pageSize.getHeight();
  const fY     = H - BOTTOM_MARGIN - FOOTER_H;
  const cleanBy = (emittedBy || '').replace(/\s*(MASTER|PRO|FREE|PREMIUM|INSTITUTIONAL)\s*/gi, '').trim() || emittedBy;

  // Separador duplo petrol + gold
  doc.setDrawColor(BRAND.r, BRAND.g, BRAND.b);
  doc.setLineWidth(0.6);
  doc.line(0, fY, W, fY);
  doc.setFillColor(GOLD.r, GOLD.g, GOLD.b);
  doc.rect(0, fY + 0.7, W, 1.2, "F");

  doc.setFillColor(248, 249, 250);
  doc.rect(0, fY + 2, W, FOOTER_H - 2, "F");

  // QR Code (lado direito, 16×16 mm)
  const qrSz  = 16;
  const qrX   = W - MR - qrSz;
  if (qrDataUrl) {
    try { doc.addImage(qrDataUrl, "PNG", qrX, fY + 3, qrSz, qrSz); } catch {}
  }
  const textRight = qrDataUrl ? qrX - 4 : W - MR;
  const cx        = ML + (textRight - ML) / 2;

  const dateStr = new Date().toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  // Linha 1 — emitido por + label
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(GRAY.r, GRAY.g, GRAY.b);
  doc.text(`Emitido por: ${cleanBy}  ·  ${dateStr}`, ML, fY + 7.5);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6);
  doc.setTextColor(BRAND.r, BRAND.g, BRAND.b);
  doc.text("DOCUMENTO PEDAGÓGICO OFICIAL", textRight, fY + 7.5, { align: "right" });

  // Linha 2 — código de auditoria
  doc.setFont("courier", "bold");
  doc.setFontSize(7);
  doc.setTextColor(BRAND.r, BRAND.g, BRAND.b);
  doc.text(auditCode, cx, fY + 14, { align: "center" });

  // Linha 3 — URL + página
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(BRAND.r, BRAND.g, BRAND.b);
  doc.text(`www.incluiai.app.br/validar/${auditCode}`, ML, fY + 20);
  doc.setTextColor(GRAY.r, GRAY.g, GRAY.b);
  doc.text(
    `Página ${doc.internal.getCurrentPageInfo().pageNumber} de ${doc.internal.getNumberOfPages()}`,
    cx, fY + 20, { align: "center" },
  );
}

function addFooterAllPages(doc: any, auditCode: string, emittedBy: string, qrDataUrl?: string) {
  const pages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    addDocFooter(doc, auditCode, emittedBy, qrDataUrl);
  }
}

// ─── Título de seção (faixa petrol — padrão IncluiAI v2) ─────────────────────
function addSectionTitle(
  doc: any,
  title: string,
  x: number,
  y: number,
  w: number
): number {
  doc.setFillColor(BRAND.r, BRAND.g, BRAND.b);
  doc.rect(x, y, w, 8, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(SMALL_SIZE + 0.5);
  doc.setTextColor(255, 255, 255);
  doc.text(title.toUpperCase(), x + 4, y + 5.5);
  return y + 11;
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
  ctx.fillStyle = "rgba(31, 78, 95, 0.18)";
  ctx.fill();
  ctx.strokeStyle = "rgba(31, 78, 95, 0.85)";
  ctx.lineWidth = 2.5;
  ctx.stroke();

  scores.forEach((val, i) => {
    const angle = i * step - Math.PI / 2;
    const rv = (val / 5) * r;
    ctx.beginPath();
    ctx.arc(cx + rv * Math.cos(angle), cy + rv * Math.sin(angle), 5, 0, Math.PI * 2);
    ctx.fillStyle = "rgb(31, 78, 95)";
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
    grad.addColorStop(0, "rgba(31, 78, 95, 0.9)");
    grad.addColorStop(1, "rgba(100, 160, 185, 0.7)");
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

  const colors = ["#1F4E5F", "#2E7D9A", "#4FA8C5", "#7CC4D8", "#C69214"];

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

  // ── Ficha do Aluno (configurável) ───────────────────────────────────────────
  async generateStudentProfilePDF(
    student: Student,
    emittedBy = "Sistema",
    school?: SchoolConfig | null,
    config?: {
      dadosAluno?: boolean; fotoAluno?: boolean; logoEscola?: boolean;
      enderecoCompleto?: boolean; codigoUnico?: boolean;
      ultimaAvaliacao?: boolean; agendamentos?: boolean;
      controleAtendimento?: boolean; linhaDoTempo?: boolean;
      documentosGerados?: boolean; relatoriosIA?: boolean;
      analiseLaudo?: boolean; fichasComplementares?: boolean;
      historicoAtividades?: boolean;
    },
    extraData?: {
      evolutions?: any[]; appointments?: any[]; serviceRecords?: any[];
      timeline?: any[]; activities?: any[]; documents?: any[];
      medicalReports?: any[]; obsForms?: any[]; fichas?: any[]; protocols?: any[];
    },
  ) {
    // config padrão: tudo habilitado quando não fornecido (retrocompatibilidade)
    const cfg = {
      dadosAluno: true, fotoAluno: true, logoEscola: true,
      enderecoCompleto: false, codigoUnico: true,
      ultimaAvaliacao: true, agendamentos: true,
      controleAtendimento: true, linhaDoTempo: false,
      documentosGerados: true, relatoriosIA: true,
      analiseLaudo: true, fichasComplementares: true,
      historicoAtividades: false,
      ...config,
    };
    const extra = extraData ?? {};

    const jsPDF = await loadJsPDF();
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const maxW = W - ML - MR;
    const auditCode = makeAuditCode("FICHA", student.id);
    const halfW = (maxW - 6) / 2;
    const col1x = ML;
    const col2x = ML + halfW + 6;

    const schoolForHeader = cfg.logoEscola ? school : null;
    const pageHeader = () =>
      addDocHeader(doc, "FICHA DO ALUNO", "Documentação Educacional Inclusiva", student.name, auditCode, schoolForHeader);

    const contentTop = pageHeader();
    let y = contentTop;

    // ════════════════════════════════════════════════════════════
    // 1. IDENTIFICAÇÃO DO ALUNO
    // ════════════════════════════════════════════════════════════
    if (cfg.dadosAluno) {
      // Bloco hero do aluno
      doc.setFillColor(BRAND_LIGHT.r, BRAND_LIGHT.g, BRAND_LIGHT.b);
      doc.roundedRect(ML, y, maxW, 42, 3, 3, "F");

      // Avatar
      doc.setFillColor(BRAND.r, BRAND.g, BRAND.b);
      doc.circle(ML + 16, y + 21, 14, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.setTextColor(255, 255, 255);
      const initials = student.name.split(" ").map((n: string) => n[0]).slice(0, 2).join("").toUpperCase();
      doc.text(initials, ML + 16, y + 24, { align: "center" });

      const infoX = ML + 36;
      doc.setTextColor(DARK.r, DARK.g, DARK.b);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.text(student.name, infoX, y + 11);

      const age = student.birthDate
        ? Math.floor((Date.now() - new Date(student.birthDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
        : "—";
      const safeBirthDate = (() => {
        if (!student.birthDate) return "—";
        const d = new Date(student.birthDate + "T00:00:00");
        return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
      })();
      const infoCol1W = col2x - infoX - 3;
      const infoCol2W = W - MR - col2x - 2;
      const col1Info = [
        `Nascimento: ${safeBirthDate}`,
        `${age} anos · ${student.gender === 'M' ? 'Masc.' : student.gender === 'F' ? 'Fem.' : student.gender || '—'}`,
        `Série: ${student.grade || "—"} · ${student.shift || "—"}`,
      ];
      const col2Info = [
        `Suporte: ${student.supportLevel || "—"}`,
        `CID: ${Array.isArray(student.cid) ? student.cid.join(", ") : student.cid || "—"}`,
        `Medicação: ${(student.medication || "—").substring(0, 30)}`,
      ];
      doc.setFont("helvetica", "normal");
      doc.setFontSize(SMALL_SIZE + 1);
      doc.setTextColor(GRAY.r, GRAY.g, GRAY.b);
      col1Info.forEach((line, i) => {
        const safeLines = doc.splitTextToSize(line, infoCol1W);
        doc.text(safeLines[0] || line, infoX, y + 20 + i * 7);
      });
      col2Info.forEach((line, i) => {
        const safeLines = doc.splitTextToSize(line, infoCol2W);
        doc.text(safeLines[0] || line, col2x, y + 20 + i * 7);
      });
      y += 48;

      const diagText = (student.diagnosis || []).join(", ");
      if (diagText) y = renderField(doc, "Diagnósticos", diagText, ML, y, maxW, LINE_H, pageHeader);

      // Endereço completo (opcional)
      if (cfg.enderecoCompleto && (student.street || student.city)) {
        const addr = [
          student.street && [student.street, student.streetNumber, student.complement].filter(Boolean).join(", "),
          student.neighborhood,
          student.city && [student.city, student.state].filter(Boolean).join(" — "),
          student.zipcode && `CEP ${student.zipcode}`,
        ].filter(Boolean).join(" · ");
        if (addr) y = renderField(doc, "Endereço", addr, ML, y, maxW, LINE_H, pageHeader);
      }

      // Equipe
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

      // Contexto + Perfil Funcional
      if (y > contentBottom(H) - 40) { doc.addPage(); y = pageHeader(); }
      y = addSectionTitle(doc, "CONTEXTO ESCOLAR E FAMILIAR", ML, y, maxW);
      y = renderField(doc, "Histórico Escolar", student.schoolHistory, ML, y, maxW, LINE_H, pageHeader);
      y = renderField(doc, "Contexto Familiar", student.familyContext || "—", ML, y, maxW, LINE_H, pageHeader);

      if (y > contentBottom(H) - 40) { doc.addPage(); y = pageHeader(); }
      y = addSectionTitle(doc, "PERFIL FUNCIONAL", ML, y, maxW);
      yL = y; yR = y;
      yL = renderField(doc, "Habilidades", (student.abilities || []).map(a => `• ${a}`).join("\n"), col1x, yL, halfW, LINE_H, pageHeader);
      yL = renderField(doc, "Estratégias Eficazes", (student.strategies || []).map(s => `• ${s}`).join("\n"), col1x, yL, halfW, LINE_H, pageHeader);
      yR = renderField(doc, "Dificuldades", (student.difficulties || []).map(d => `• ${d}`).join("\n"), col2x, yR, halfW, LINE_H, pageHeader);
      yR = renderField(doc, "Comunicação", (student.communication || []).join(", "), col2x, yR, halfW, LINE_H, pageHeader);
      y = Math.max(yL, yR) + 4;

      if (student.observations) {
        if (y > contentBottom(H) - 40) { doc.addPage(); y = pageHeader(); }
        y = addSectionTitle(doc, "OBSERVAÇÕES GERAIS", ML, y, maxW);
        y = renderField(doc, "", student.observations, ML, y, maxW, LINE_H, pageHeader);
      }
    }

    // ════════════════════════════════════════════════════════════
    // 2. ÚLTIMA AVALIAÇÃO — REDESENHADA
    // ════════════════════════════════════════════════════════════
    if (cfg.ultimaAvaliacao && extra.evolutions && extra.evolutions.length > 0) {
      const ev = extra.evolutions[0]; // mais recente
      const scores: number[] = ev.scores || [];
      const CRITERIA_NAMES = [
        'Comunicação Expressiva', 'Interação Social', 'Autonomia (AVD)', 'Autorregulação',
        'Atenção Sustentada', 'Compreensão', 'Motricidade Fina', 'Motricidade Grossa',
        'Participação', 'Linguagem/Leitura',
      ];

      if (y > contentBottom(H) - 80) { doc.addPage(); y = pageHeader(); }
      y = addSectionTitle(doc, "AVALIAÇÃO COGNITIVA E FUNCIONAL", ML, y, maxW);

      // ─── A. RESUMO DA AVALIAÇÃO ──────────────────────────────
      const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
      const avgRound = Math.round(avg * 10) / 10;
      const avgPct = Math.round((avg / 5) * 100);

      // Card de resumo (fundo petrol-light, borda petrol)
      const resumoH = 38;
      doc.setFillColor(BRAND_LIGHT.r, BRAND_LIGHT.g, BRAND_LIGHT.b);
      doc.setDrawColor(BRAND.r, BRAND.g, BRAND.b);
      doc.setLineWidth(0.4);
      doc.roundedRect(ML, y, maxW, resumoH, 3, 3, "FD");

      // Linha de topo petrol
      doc.setFillColor(BRAND.r, BRAND.g, BRAND.b);
      doc.rect(ML, y, maxW, 6, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(SMALL_SIZE);
      doc.setTextColor(255, 255, 255);
      doc.text("RESUMO DA AVALIAÇÃO", ML + 4, y + 4.5);

      const ry = y + 10;

      // Data + Profissional
      const evDate = ev.date ? new Date(ev.date).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" }) : "—";
      doc.setFont("helvetica", "normal");
      doc.setFontSize(SMALL_SIZE);
      doc.setTextColor(GRAY.r, GRAY.g, GRAY.b);
      doc.text(`Avaliação: ${evDate}  ·  Profissional: ${ev.author || "—"}`, ML + 4, ry);

      // Média com barra de progresso
      const avgColor = avgRound >= 4 ? [22, 163, 74] : avgRound >= 3 ? [31, 78, 95] : avgRound >= 2 ? [217, 119, 6] : [220, 38, 38];
      doc.setFont("helvetica", "bold");
      doc.setFontSize(SMALL_SIZE + 1);
      doc.setTextColor(avgColor[0], avgColor[1], avgColor[2]);
      doc.text(`Média geral: ${avgRound}/5  (${avgPct}%)`, ML + 4, ry + 7);
      // Barra de progresso da média
      doc.setFillColor(218, 224, 229);
      doc.rect(ML + 4, ry + 9, 60, 3, "F");
      doc.setFillColor(avgColor[0], avgColor[1], avgColor[2]);
      doc.rect(ML + 4, ry + 9, 60 * (avg / 5), 3, "F");

      // Áreas fortes (score >= 4) e prioritárias (score <= 2)
      const strong   = CRITERIA_NAMES.filter((_, i) => (scores[i] ?? 0) >= 4).slice(0, 3);
      const priority = CRITERIA_NAMES.filter((_, i) => (scores[i] ?? 0) <= 2).slice(0, 3);
      const colMidX  = ML + maxW / 2 + 2;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(SMALL_SIZE - 0.5);
      doc.setTextColor(22, 163, 74);
      doc.text("ÁREAS FORTES", ML + 4, ry + 17);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(DARK.r, DARK.g, DARK.b);
      if (strong.length > 0) {
        strong.forEach((s, i) => { doc.text(`• ${s}`, ML + 4, ry + 22 + i * 4.5); });
      } else {
        doc.text("— Nenhuma destacada", ML + 4, ry + 22);
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(SMALL_SIZE - 0.5);
      doc.setTextColor(217, 119, 6);
      doc.text("ÁREAS PRIORITÁRIAS", colMidX, ry + 17);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(DARK.r, DARK.g, DARK.b);
      if (priority.length > 0) {
        priority.forEach((s, i) => { doc.text(`• ${s}`, colMidX, ry + 22 + i * 4.5); });
      } else {
        doc.text("— Todas em nível adequado", colMidX, ry + 22);
      }

      y += resumoH + 5;

      // ─── B. RADAR + PONTUAÇÕES ────────────────────────────────
      if (y > contentBottom(H) - 90) { doc.addPage(); y = pageHeader(); }

      const criteriaForChart = CRITERIA_NAMES.map(name => ({ name }));
      try {
        const radarB64 = await generateRadarCanvas(scores, criteriaForChart);
        const radarSz  = 68;
        doc.addImage(radarB64, "PNG", ML, y, radarSz, radarSz);

        // Pontuações por dimensão (lado direito do radar)
        const legendX = ML + radarSz + 6;
        const legendW = W - MR - legendX - 2;
        const barW    = Math.min(38, legendW * 0.45);

        let ly = y + 2;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(SMALL_SIZE);
        doc.setTextColor(DARK.r, DARK.g, DARK.b);
        doc.text("Pontuação por Dimensão", legendX, ly);
        ly += 6;

        CRITERIA_NAMES.forEach((name, i) => {
          const score = scores[i] ?? 0;
          const sc    = score >= 4 ? [22, 163, 74] : score >= 3 ? [31, 78, 95] : score >= 2 ? [217, 119, 6] : [220, 38, 38];

          // Nome abreviado
          const abbrev = doc.splitTextToSize(name, legendW - barW - 14)[0] || name;
          doc.setFont("helvetica", "normal");
          doc.setFontSize(SMALL_SIZE - 1);
          doc.setTextColor(DARK.r, DARK.g, DARK.b);
          doc.text(abbrev, legendX, ly);

          // Mini barra
          doc.setFillColor(218, 224, 229);
          doc.rect(legendX, ly + 1, barW, 3, "F");
          doc.setFillColor(sc[0], sc[1], sc[2]);
          doc.rect(legendX, ly + 1, barW * (score / 5), 3, "F");

          // Score
          doc.setFont("helvetica", "bold");
          doc.setFontSize(SMALL_SIZE - 1);
          doc.setTextColor(sc[0], sc[1], sc[2]);
          doc.text(`${score}/5`, legendX + barW + 2, ly + 3.5);

          ly += 6.5;
        });
        y = Math.max(y + radarSz + 5, ly + 3);
      } catch {
        // Fallback sem gráfico
        CRITERIA_NAMES.forEach((name, i) => {
          doc.setFont("helvetica", "normal");
          doc.setFontSize(BODY_SIZE);
          doc.setTextColor(DARK.r, DARK.g, DARK.b);
          doc.text(`${name}: ${scores[i] ?? "—"}/5`, ML, y);
          y += LINE_H;
        });
        y += 4;
      }

      // ─── C. PARECER DESCRITIVO ────────────────────────────────
      if (ev.observation) {
        if (y > contentBottom(H) - 50) { doc.addPage(); y = pageHeader(); }

        // Faixa "PARECER DESCRITIVO" em petrol com acento gold
        doc.setFillColor(BRAND.r, BRAND.g, BRAND.b);
        doc.rect(ML, y, maxW, 8, "F");
        doc.setFillColor(GOLD.r, GOLD.g, GOLD.b);
        doc.rect(ML, y + 8, maxW, 1.2, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(SMALL_SIZE + 0.5);
        doc.setTextColor(255, 255, 255);
        doc.text("PARECER DESCRITIVO", ML + 4, y + 5.5);
        y += 12;

        // Texto analítico com boa hierarquia tipográfica
        // Divide o parecer em parágrafos e renderiza com espaçamento
        const paragraphs = (ev.observation as string).split(/\n{2,}|\r\n{2,}/).filter(Boolean);
        for (const para of paragraphs) {
          if (y > contentBottom(H) - 25) { doc.addPage(); y = pageHeader(); }

          // Detecta linhas que parecem títulos/subtítulos (curtas, em maiúscula ou com ":")
          const trimmed = para.trim();
          const isHeading = trimmed.length < 60 && (/^[A-ZÁÉÍÓÚÀÂÊÔ].{0,58}:$/.test(trimmed) || trimmed === trimmed.toUpperCase());

          if (isHeading) {
            doc.setFont("helvetica", "bold");
            doc.setFontSize(BODY_SIZE);
            doc.setTextColor(BRAND.r, BRAND.g, BRAND.b);
            doc.text(trimmed, ML, y);
            y += LINE_H + 1;
          } else {
            doc.setFont("helvetica", "normal");
            doc.setFontSize(BODY_SIZE);
            doc.setTextColor(DARK.r, DARK.g, DARK.b);
            // Indentação no primeiro parágrafo
            const lines = doc.splitTextToSize(trimmed, maxW - 4);
            doc.text(lines, ML + 2, y);
            y += lines.length * LINE_H + 3; // +3mm entre parágrafos
          }
        }
        y += 4;
      }
    }

    // ════════════════════════════════════════════════════════════
    // 3. AGENDAMENTOS
    // ════════════════════════════════════════════════════════════
    if (cfg.agendamentos && extra.appointments && extra.appointments.length > 0) {
      if (y > contentBottom(H) - 50) { doc.addPage(); y = pageHeader(); }
      y = addSectionTitle(doc, "AGENDAMENTOS", ML, y, maxW);

      // Cabeçalho da tabela
      const cols = { data: 24, hora: 18, titulo: 54, tipo: 28, prof: 28, status: maxW - 24 - 18 - 54 - 28 - 28 };
      doc.setFillColor(BRAND_LIGHT.r, BRAND_LIGHT.g, BRAND_LIGHT.b);
      doc.rect(ML, y, maxW, 7, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(SMALL_SIZE - 0.5);
      doc.setTextColor(BRAND.r, BRAND.g, BRAND.b);
      let cx = ML + 2;
      ["DATA", "HORA", "TÍTULO", "TIPO", "PROFISSIONAL", "STATUS"].forEach((h, i) => {
        const w = [cols.data, cols.hora, cols.titulo, cols.tipo, cols.prof, cols.status][i];
        doc.text(h, cx, y + 5);
        cx += w;
      });
      y += 8;

      for (const a of extra.appointments) {
        if (y > contentBottom(H) - 15) { doc.addPage(); y = pageHeader(); }
        const dateStr = a.date ? new Date(a.date + "T00:00:00").toLocaleDateString("pt-BR") : "—";
        const statusColors: Record<string, number[]> = {
          realizado: [22, 163, 74], cancelado: [220, 38, 38], falta: [217, 119, 6],
        };
        const sc = statusColors[a.status] || [31, 78, 95];

        doc.setFont("helvetica", "normal");
        doc.setFontSize(SMALL_SIZE - 1);
        doc.setTextColor(DARK.r, DARK.g, DARK.b);
        cx = ML + 2;
        const row = [dateStr, a.time || "—", (a.title || "").substring(0, 28), (a.type || "—").substring(0, 16), (a.professional || "—").substring(0, 16)];
        row.forEach((val, i) => {
          const w = [cols.data, cols.hora, cols.titulo, cols.tipo, cols.prof][i];
          doc.text(val, cx, y + 4);
          cx += w;
        });
        doc.setFont("helvetica", "bold");
        doc.setTextColor(sc[0], sc[1], sc[2]);
        doc.text((a.status || "agendado").toUpperCase(), cx, y + 4);

        // Linha divisória
        doc.setDrawColor(218, 224, 229);
        doc.setLineWidth(0.2);
        doc.line(ML, y + 6.5, ML + maxW, y + 6.5);
        y += 7.5;
      }
      y += 4;
    }

    // ════════════════════════════════════════════════════════════
    // 4. CONTROLE DE ATENDIMENTO
    // ════════════════════════════════════════════════════════════
    if (cfg.controleAtendimento && extra.serviceRecords && extra.serviceRecords.length > 0) {
      if (y > contentBottom(H) - 50) { doc.addPage(); y = pageHeader(); }
      y = addSectionTitle(doc, "CONTROLE DE ATENDIMENTO", ML, y, maxW);

      const total    = extra.serviceRecords.length;
      const presente = extra.serviceRecords.filter((r: any) => r.attendance === 'Presente').length;
      const taxa     = total > 0 ? Math.round((presente / total) * 100) : 0;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(SMALL_SIZE);
      doc.setTextColor(GRAY.r, GRAY.g, GRAY.b);
      doc.text(`${total} atendimento(s) · Presença: ${taxa}%`, ML, y);
      // Barra de presença
      doc.setFillColor(218, 224, 229);
      doc.rect(ML, y + 3, 60, 3, "F");
      doc.setFillColor(22, 163, 74);
      doc.rect(ML, y + 3, 60 * (taxa / 100), 3, "F");
      y += 10;

      // Tabela compacta
      doc.setFillColor(BRAND_LIGHT.r, BRAND_LIGHT.g, BRAND_LIGHT.b);
      doc.rect(ML, y, maxW, 7, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(SMALL_SIZE - 0.5);
      doc.setTextColor(BRAND.r, BRAND.g, BRAND.b);
      const scCols = { data: 26, hora: 18, tipo: 34, prof: 38, pres: 20, obs: maxW - 26 - 18 - 34 - 38 - 20 };
      let scx = ML + 2;
      ["DATA", "HORA", "TIPO", "PROFISSIONAL", "PRESENÇA", "OBSERVAÇÕES"].forEach((h, i) => {
        const w = [scCols.data, scCols.hora, scCols.tipo, scCols.prof, scCols.pres, scCols.obs][i];
        doc.text(h, scx, y + 5);
        scx += w;
      });
      y += 8;

      for (const r of extra.serviceRecords.slice(0, 30)) {
        if (y > contentBottom(H) - 15) { doc.addPage(); y = pageHeader(); }
        const dateStr = r.date ? new Date(r.date).toLocaleDateString("pt-BR") : "—";
        const presColor = r.attendance === 'Presente' ? [22, 163, 74] : r.attendance === 'Falta' ? [220, 38, 38] : [108, 117, 125];

        doc.setFont("helvetica", "normal");
        doc.setFontSize(SMALL_SIZE - 1);
        doc.setTextColor(DARK.r, DARK.g, DARK.b);
        scx = ML + 2;
        [dateStr, r.time || "—", (r.type || "—").substring(0, 18), (r.professional || "—").substring(0, 20)].forEach((val, i) => {
          const w = [scCols.data, scCols.hora, scCols.tipo, scCols.prof][i];
          doc.text(val, scx, y + 4);
          scx += w;
        });
        doc.setFont("helvetica", "bold");
        doc.setTextColor(presColor[0], presColor[1], presColor[2]);
        doc.text(r.attendance || "—", scx, y + 4);
        scx += scCols.pres;
        doc.setFont("helvetica", "normal");
        doc.setTextColor(GRAY.r, GRAY.g, GRAY.b);
        const obsText = (r.observations || "").substring(0, 30);
        doc.text(obsText, scx, y + 4);

        doc.setDrawColor(218, 224, 229);
        doc.setLineWidth(0.2);
        doc.line(ML, y + 6.5, ML + maxW, y + 6.5);
        y += 7.5;
      }
      if (extra.serviceRecords.length > 30) {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(SMALL_SIZE - 1);
        doc.setTextColor(GRAY.r, GRAY.g, GRAY.b);
        doc.text(`… e mais ${extra.serviceRecords.length - 30} registros`, ML, y + 3);
        y += 6;
      }
      y += 4;
    }

    // ════════════════════════════════════════════════════════════
    // 5. LINHA DO TEMPO
    // ════════════════════════════════════════════════════════════
    if (cfg.linhaDoTempo && extra.timeline && extra.timeline.length > 0) {
      if (y > contentBottom(H) - 50) { doc.addPage(); y = pageHeader(); }
      y = addSectionTitle(doc, "LINHA DO TEMPO", ML, y, maxW);

      const timelineEvents = extra.timeline.slice(0, 20);
      for (const evt of timelineEvents) {
        if (y > contentBottom(H) - 15) { doc.addPage(); y = pageHeader(); }
        const dateStr = evt.created_at ? new Date(evt.created_at).toLocaleDateString("pt-BR") : "—";

        // Ponto na linha do tempo
        doc.setFillColor(BRAND.r, BRAND.g, BRAND.b);
        doc.circle(ML + 3, y + 3.5, 2.5, "F");
        doc.setDrawColor(BRAND.r, BRAND.g, BRAND.b);
        doc.setLineWidth(0.3);
        doc.line(ML + 3, y + 6, ML + 3, y + 9);

        doc.setFont("helvetica", "bold");
        doc.setFontSize(SMALL_SIZE);
        doc.setTextColor(DARK.r, DARK.g, DARK.b);
        doc.text(evt.title || "Evento", ML + 9, y + 4);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(SMALL_SIZE - 1);
        doc.setTextColor(GRAY.r, GRAY.g, GRAY.b);
        doc.text(`${dateStr}${evt.event_type ? " · " + evt.event_type : ""}`, ML + 9, y + 8.5);

        if (evt.description) {
          doc.setFontSize(SMALL_SIZE - 1.5);
          const descLines = doc.splitTextToSize(evt.description.substring(0, 100), maxW - 12);
          doc.text(descLines[0] || evt.description, ML + 9, y + 12.5);
          y += 16;
        } else {
          y += 12;
        }
      }
      if (extra.timeline.length > 20) {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(SMALL_SIZE - 1);
        doc.setTextColor(GRAY.r, GRAY.g, GRAY.b);
        doc.text(`… e mais ${extra.timeline.length - 20} eventos`, ML, y + 2);
        y += 6;
      }
      y += 4;
    }

    // ════════════════════════════════════════════════════════════
    // 6. DOCUMENTOS GERADOS (protocolos: PEI, PAEE, PDI, etc.)
    // ════════════════════════════════════════════════════════════
    if (cfg.documentosGerados && extra.protocols && extra.protocols.length > 0) {
      if (y > contentBottom(H) - 50) { doc.addPage(); y = pageHeader(); }
      y = addSectionTitle(doc, "DOCUMENTOS PEDAGÓGICOS GERADOS", ML, y, maxW);

      for (const p of extra.protocols) {
        if (y > contentBottom(H) - 12) { doc.addPage(); y = pageHeader(); }
        const dateStr = p.createdAt ? new Date(p.createdAt).toLocaleDateString("pt-BR") : "—";
        const status  = p.status === 'FINAL' ? 'Concluído' : 'Rascunho';
        const sc      = p.status === 'FINAL' ? [22, 163, 74] : [108, 117, 125];

        doc.setFont("helvetica", "bold");
        doc.setFontSize(SMALL_SIZE);
        doc.setTextColor(DARK.r, DARK.g, DARK.b);
        doc.text(`• ${p.title || p.doc_type || "Documento"}`, ML + 2, y + 4);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(GRAY.r, GRAY.g, GRAY.b);
        doc.text(`${dateStr} · por ${p.generatedBy || "Sistema"}`, ML + 8, y + 9);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(sc[0], sc[1], sc[2]);
        doc.text(status, W - MR - 20, y + 4);

        doc.setDrawColor(218, 224, 229);
        doc.setLineWidth(0.2);
        doc.line(ML, y + 11, ML + maxW, y + 11);
        y += 13;
      }
      y += 3;
    }

    // ════════════════════════════════════════════════════════════
    // 7. RELATÓRIOS POR IA (medical_reports / análises evolutivas)
    // ════════════════════════════════════════════════════════════
    if (cfg.relatoriosIA && extra.medicalReports && extra.medicalReports.length > 0) {
      if (y > contentBottom(H) - 50) { doc.addPage(); y = pageHeader(); }
      y = addSectionTitle(doc, "RELATÓRIOS E ANÁLISES POR IA", ML, y, maxW);

      for (const r of extra.medicalReports.slice(0, 5)) {
        if (y > contentBottom(H) - 30) { doc.addPage(); y = pageHeader(); }
        const dateStr = r.created_at ? new Date(r.created_at).toLocaleDateString("pt-BR") : "—";

        doc.setFont("helvetica", "bold");
        doc.setFontSize(SMALL_SIZE);
        doc.setTextColor(BRAND.r, BRAND.g, BRAND.b);
        doc.text(`Análise — ${dateStr}`, ML + 2, y + 4);
        y += 7;

        if (r.synthesis) {
          doc.setFont("helvetica", "italic");
          doc.setFontSize(SMALL_SIZE - 0.5);
          doc.setTextColor(DARK.r, DARK.g, DARK.b);
          const synLines = doc.splitTextToSize(`"${r.synthesis}"`, maxW - 6);
          const trimmed  = synLines.slice(0, 3);
          doc.text(trimmed, ML + 4, y + 2);
          y += trimmed.length * 5 + 2;
        }
        if (Array.isArray(r.pedagogical_points) && r.pedagogical_points.length > 0) {
          doc.setFont("helvetica", "normal");
          doc.setFontSize(SMALL_SIZE - 1);
          doc.setTextColor(GRAY.r, GRAY.g, GRAY.b);
          doc.text("Pontos pedagógicos: " + r.pedagogical_points.slice(0, 3).map((p: string) => `• ${p}`).join("  "), ML + 4, y + 2);
          y += 5;
        }
        doc.setDrawColor(218, 224, 229);
        doc.setLineWidth(0.2);
        doc.line(ML, y + 3, ML + maxW, y + 3);
        y += 6;
      }
      y += 3;
    }

    // ════════════════════════════════════════════════════════════
    // 8. ANÁLISE DE LAUDO (student_documents com análise vinculada)
    // ════════════════════════════════════════════════════════════
    if (cfg.analiseLaudo && extra.documents && extra.documents.length > 0) {
      const docsWithAnalysis = extra.documents.filter((d: any) => d.type === 'Laudo' || d.type === 'Relatorio');
      if (docsWithAnalysis.length > 0) {
        if (y > contentBottom(H) - 40) { doc.addPage(); y = pageHeader(); }
        y = addSectionTitle(doc, "LAUDOS E DOCUMENTOS CLÍNICOS ANEXADOS", ML, y, maxW);

        for (const d of docsWithAnalysis) {
          if (y > contentBottom(H) - 12) { doc.addPage(); y = pageHeader(); }
          doc.setFont("helvetica", "bold");
          doc.setFontSize(SMALL_SIZE);
          doc.setTextColor(DARK.r, DARK.g, DARK.b);
          doc.text(`• ${d.name}`, ML + 2, y + 4);
          doc.setFont("helvetica", "normal");
          doc.setFontSize(SMALL_SIZE - 1);
          doc.setTextColor(GRAY.r, GRAY.g, GRAY.b);
          doc.text(`${d.date || "—"} · Tipo: ${d.type}`, ML + 8, y + 9);
          doc.setDrawColor(218, 224, 229);
          doc.setLineWidth(0.2);
          doc.line(ML, y + 11, ML + maxW, y + 11);
          y += 13;
        }
        y += 3;
      }
    }

    // ════════════════════════════════════════════════════════════
    // 9. FICHAS COMPLEMENTARES
    // ════════════════════════════════════════════════════════════
    if (cfg.fichasComplementares && extra.obsForms && extra.obsForms.length > 0) {
      if (y > contentBottom(H) - 50) { doc.addPage(); y = pageHeader(); }
      y = addSectionTitle(doc, "FICHAS COMPLEMENTARES DE OBSERVAÇÃO", ML, y, maxW);

      for (const f of extra.obsForms.slice(0, 10)) {
        if (y > contentBottom(H) - 12) { doc.addPage(); y = pageHeader(); }
        const dateStr = f.created_at ? new Date(f.created_at).toLocaleDateString("pt-BR") : "—";
        doc.setFont("helvetica", "bold");
        doc.setFontSize(SMALL_SIZE);
        doc.setTextColor(DARK.r, DARK.g, DARK.b);
        doc.text(`• ${f.title || f.ficha_type || "Ficha de Observação"}`, ML + 2, y + 4);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(SMALL_SIZE - 1);
        doc.setTextColor(GRAY.r, GRAY.g, GRAY.b);
        doc.text(`${dateStr} · ${f.professional_name || f.created_by || "Profissional"}`, ML + 8, y + 9);
        doc.setDrawColor(218, 224, 229);
        doc.setLineWidth(0.2);
        doc.line(ML, y + 11, ML + maxW, y + 11);
        y += 13;
      }
      if (extra.obsForms.length > 10) {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(SMALL_SIZE - 1);
        doc.setTextColor(GRAY.r, GRAY.g, GRAY.b);
        doc.text(`… e mais ${extra.obsForms.length - 10} fichas`, ML, y + 2);
        y += 6;
      }
      y += 3;
    }

    // ════════════════════════════════════════════════════════════
    // 10. HISTÓRICO DE ATIVIDADES GERADAS (somente metadados)
    // ════════════════════════════════════════════════════════════
    if (cfg.historicoAtividades && extra.activities && extra.activities.length > 0) {
      if (y > contentBottom(H) - 50) { doc.addPage(); y = pageHeader(); }
      y = addSectionTitle(doc, "HISTÓRICO DE ATIVIDADES GERADAS", ML, y, maxW);

      // Nota explicativa
      doc.setFont("helvetica", "italic");
      doc.setFontSize(SMALL_SIZE - 1);
      doc.setTextColor(GRAY.r, GRAY.g, GRAY.b);
      doc.text("Registro de geração — sem o conteúdo das atividades.", ML, y);
      y += 6;

      // Cabeçalho tabela
      const actCols = { data: 24, titulo: 64, tipo: 32, status: maxW - 24 - 64 - 32 };
      doc.setFillColor(BRAND_LIGHT.r, BRAND_LIGHT.g, BRAND_LIGHT.b);
      doc.rect(ML, y, maxW, 7, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(SMALL_SIZE - 0.5);
      doc.setTextColor(BRAND.r, BRAND.g, BRAND.b);
      let acx = ML + 2;
      ["DATA", "TÍTULO", "TIPO", "STATUS"].forEach((h, i) => {
        const w = [actCols.data, actCols.titulo, actCols.tipo, actCols.status][i];
        doc.text(h, acx, y + 5);
        acx += w;
      });
      y += 8;

      for (const a of extra.activities) {
        if (y > contentBottom(H) - 12) { doc.addPage(); y = pageHeader(); }
        const dateStr = a.created_at ? new Date(a.created_at).toLocaleDateString("pt-BR") : "—";

        doc.setFont("helvetica", "normal");
        doc.setFontSize(SMALL_SIZE - 1);
        doc.setTextColor(DARK.r, DARK.g, DARK.b);
        acx = ML + 2;
        [dateStr, (a.title || "Atividade").substring(0, 36), (a.discipline || a.activity_type || "—").substring(0, 18)].forEach((val, i) => {
          const w = [actCols.data, actCols.titulo, actCols.tipo][i];
          doc.text(val, acx, y + 4);
          acx += w;
        });
        doc.setFont("helvetica", "bold");
        doc.setTextColor(22, 163, 74);
        doc.text(a.tags ? a.tags.slice(0, 2).join(", ") : "—", acx, y + 4);

        doc.setDrawColor(218, 224, 229);
        doc.setLineWidth(0.2);
        doc.line(ML, y + 6.5, ML + maxW, y + 6.5);
        y += 7.5;
      }
      y += 4;
    }

    // ════════════════════════════════════════════════════════════
    // ASSINATURAS (sempre no final)
    // ════════════════════════════════════════════════════════════
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

    const qrDataUrl = cfg.codigoUnico ? await buildQrDataUrl(auditCode) : undefined;
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

      // Legenda ao lado do radar
      // Espaço disponível: de (ML + imgSize + 6) = 110mm até (W - MR) = 190mm → 80mm
      const legendX = ML + imgSize + 6;   // 110mm
      const legendMaxW = W - MR - legendX - 2; // ~78mm
      const barW = 32;   // barra de progresso: 32mm
      const scoreX = legendX + barW + 2; // texto de score: logo após a barra

      let ly = y + 4;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(BODY_SIZE);
      doc.setTextColor(DARK.r, DARK.g, DARK.b);
      doc.text("Mapa de Evolução (Radar)", legendX, ly);
      ly += 8;

      criteria.forEach((c, i) => {
        const score = scores[i] ?? 0;
        const pct = Math.round((score / 5) * 100);

        // Nome do critério (abreviado para caber na largura)
        const nameLines = doc.splitTextToSize(c.name, legendMaxW);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(SMALL_SIZE);
        doc.setTextColor(DARK.r, DARK.g, DARK.b);
        doc.text(nameLines[0] || c.name, legendX, ly);
        ly += 4.5;

        // Barra mini de progresso
        doc.setFillColor(236, 244, 247);
        doc.rect(legendX, ly - 3, barW, 4, "F");
        const scoreColor = score >= 4 ? [22, 163, 74] : score >= 3 ? [124, 58, 237] : score >= 2 ? [217, 119, 6] : [220, 38, 38];
        doc.setFillColor(scoreColor[0], scoreColor[1], scoreColor[2]);
        doc.rect(legendX, ly - 3, barW * (score / 5), 4, "F");

        // Score texto
        doc.setFont("helvetica", "bold");
        doc.setFontSize(SMALL_SIZE);
        doc.setTextColor(scoreColor[0], scoreColor[1], scoreColor[2]);
        doc.text(`${score}/5  ${pct}%`, scoreX, ly);
        ly += 5;
      });

      // y avança para o maior dos dois lados (radar ou legenda)
      y = Math.max(y + imgSize + 8, ly + 4);
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
      doc.setFillColor(236, 244, 247);
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
