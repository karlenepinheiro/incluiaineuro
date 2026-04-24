import { jsPDF } from 'jspdf';

const PETROL   = '#1F4E5F';
const DARK     = '#2E3A59';
const GOLD     = '#C69214';
const GRAY_600 = '#4B5563';
const GRAY_400 = '#9CA3AF';
const RED      = '#DC2626';
const GREEN    = '#16A34A';

function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}

function setColor(doc: jsPDF, hex: string) {
  doc.setTextColor(...hexToRgb(hex));
}

function setFill(doc: jsPDF, hex: string) {
  doc.setFillColor(...hexToRgb(hex));
}

function setDraw(doc: jsPDF, hex: string) {
  doc.setDrawColor(...hexToRgb(hex));
}

/** Quebra texto longo e retorna as linhas geradas, avançando `y`. */
function writeWrapped(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
): number {
  const lines = doc.splitTextToSize(String(text || ''), maxWidth);
  doc.text(lines, x, y);
  return y + lines.length * lineHeight;
}

/** Adiciona nova página se `y` ultrapassar `maxY`. */
function checkPageBreak(doc: jsPDF, y: number, maxY = 270): number {
  if (y > maxY) {
    doc.addPage();
    return 24;
  }
  return y;
}

// ─── HEADER ─────────────────────────────────────────────────────────────────

function addHeader(doc: jsPDF, student: any, docType: string, school?: any) {
  // Banner petrol topo
  setFill(doc, PETROL);
  doc.rect(0, 0, 210, 22, 'F');

  // Logo texto
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  setColor(doc, '#FFFFFF');
  doc.text('IncluiAI', 14, 14);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  setColor(doc, '#FFFFFF');
  doc.text('Pense. Crie. Inclua.', 14, 19);

  // Info direita
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(student?.name || 'Aluno', 196, 10, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.text(school?.name || 'Instituição de Ensino', 196, 15, { align: 'right' });
  const dateStr = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  doc.text(dateStr, 196, 19.5, { align: 'right' });

  // Título do documento
  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  setColor(doc, PETROL);
  doc.text(docType.toUpperCase(), 105, 33, { align: 'center' });

  // Linha divisória gold
  setDraw(doc, GOLD);
  doc.setLineWidth(0.8);
  doc.line(14, 36, 196, 36);
}

// ─── FOOTER ─────────────────────────────────────────────────────────────────

function addFooter(doc: jsPDF, pageNum: number, totalPages: number, docId: string) {
  const y = 287;
  setDraw(doc, GRAY_400);
  doc.setLineWidth(0.3);
  doc.line(14, y - 4, 196, y - 4);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  setColor(doc, GRAY_400);
  doc.text('Documento gerado pelo sistema IncluiAI', 14, y);
  doc.text(`Cód: ${docId?.slice(0, 8).toUpperCase() || 'N/A'}`, 105, y, { align: 'center' });
  doc.text(`Pág. ${pageNum}/${totalPages}`, 196, y, { align: 'right' });
}

// ─── SEÇÃO GENÉRICA (título + corpo) ────────────────────────────────────────

function addSection(doc: jsPDF, title: string, body: string, y: number): number {
  y = checkPageBreak(doc, y);

  // Título da seção
  setFill(doc, '#F3F4F6');
  doc.rect(14, y - 4, 182, 8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  setColor(doc, PETROL);
  doc.text(title.toUpperCase(), 17, y + 0.5);
  y += 9;

  // Corpo
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  setColor(doc, DARK);
  y = writeWrapped(doc, body, 17, y, 176, 5.5);
  return y + 5;
}

// ─── LISTA (dificuldades / potencialidades) ──────────────────────────────────

function addListSection(
  doc: jsPDF,
  title: string,
  items: string[],
  y: number,
  color: string,
): number {
  if (!items?.length) return y;
  y = checkPageBreak(doc, y);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  setColor(doc, color);
  doc.text(title.toUpperCase(), 17, y);
  y += 6;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  setColor(doc, DARK);
  for (const item of items) {
    y = checkPageBreak(doc, y);
    doc.text('•', 17, y);
    y = writeWrapped(doc, item, 22, y, 171, 5.5);
    y += 1;
  }
  return y + 4;
}

// ─── BLOCO DE AVALIAÇÃO ──────────────────────────────────────────────────────

function addAvaliacaoSection(doc: jsPDF, items: any[], y: number): number {
  if (!items?.length) return y;
  y = checkPageBreak(doc, y);

  // Cabeçalho
  setFill(doc, '#F3F4F6');
  doc.rect(14, y - 4, 182, 8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  setColor(doc, PETROL);
  doc.text('MÉTRICAS DE OBSERVAÇÃO', 17, y + 0.5);
  y += 10;

  for (const item of items) {
    y = checkPageBreak(doc, y);
    const nivel = item.escala ?? item.nivel ?? '–';

    // Pergunta + nível
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    setColor(doc, DARK);
    const perguntaLines = doc.splitTextToSize(String(item.pergunta || ''), 155);
    doc.text(perguntaLines, 17, y);

    // Badge nível
    setFill(doc, PETROL);
    doc.roundedRect(175, y - 4, 21, 6, 1.5, 1.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    setColor(doc, '#FFFFFF');
    doc.text(`Nív. ${nivel}/5`, 185.5, y - 0.5, { align: 'center' });

    y += perguntaLines.length * 5.5;

    if (item.justificativa) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      setColor(doc, GRAY_600);
      y = writeWrapped(doc, item.justificativa, 20, y, 173, 5);
    }
    y += 4;
  }
  return y + 2;
}

// ─── SEÇÕES PEI/PAEE/PDI (protocolo estruturado) ────────────────────────────

function addProtocolSections(doc: jsPDF, sections: any[], y: number): number {
  for (const section of sections) {
    y = checkPageBreak(doc, y);
    if (!section?.fields?.length) continue;

    // Título da seção
    setFill(doc, PETROL);
    doc.rect(14, y - 4, 182, 9, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    setColor(doc, '#FFFFFF');
    doc.text((section.sectionTitle || section.title || 'SEÇÃO').toUpperCase(), 17, y + 1);
    y += 11;

    for (const field of section.fields) {
      y = checkPageBreak(doc, y);
      const value = String(field.value || field.content || '').trim();
      if (!value) continue;

      const label = (field.label || field.fieldId || '').toString();
      if (label) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        setColor(doc, PETROL);
        doc.text(label.toUpperCase(), 17, y);
        y += 5;
      }

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      setColor(doc, DARK);
      y = writeWrapped(doc, value, 17, y, 176, 5.2);
      y += 3;
    }
    y += 4;
  }
  return y;
}

// ─── ASSINATURA ──────────────────────────────────────────────────────────────

function addSignatureArea(doc: jsPDF, y: number) {
  y = checkPageBreak(doc, y, 250);
  y += 10;

  setDraw(doc, GRAY_400);
  doc.setLineWidth(0.4);
  doc.line(14, y, 96, y);
  doc.line(114, y, 196, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  setColor(doc, GRAY_600);
  doc.text('Profissional Responsável', 55, y + 5, { align: 'center' });
  doc.text('Coordenação / Direção', 155, y + 5, { align: 'center' });
}

// ─── EXPORT PRINCIPAL ────────────────────────────────────────────────────────

export async function exportDocumentToPDF(doc: any, student: any, school?: any) {
  const data: any = doc.structured_data || {};
  const docType   = doc.doc_type || doc.type || 'DOCUMENTO PEDAGÓGICO';
  const pdf       = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });

  addHeader(pdf, student, docType, school);
  let y = 44;

  // ── Detecta formato ──────────────────────────────────────────────────────
  const isProtocol = Array.isArray(data.sections) && data.sections.length > 0;

  if (isProtocol) {
    // PEI / PAEE / PDI / Estudo de Caso
    y = addProtocolSections(pdf, data.sections, y);
  } else {
    // Relatório / Perfil cognitivo
    if (data.resumoExecutivo) {
      y = addSection(pdf, 'Resumo Executivo', data.resumoExecutivo, y);
    }
    if (data.analisePedagogica) {
      y = addSection(pdf, 'Análise Pedagógica', data.analisePedagogica, y);
    }
    if (data.dificuldades?.length) {
      y = addListSection(pdf, 'Pontos de Atenção', data.dificuldades, y, RED);
    }
    if (data.potencialidades?.length) {
      y = addListSection(pdf, 'Potencialidades', data.potencialidades, y, GREEN);
    }
    if (data.blocoAvaliacao?.length) {
      y = addAvaliacaoSection(pdf, data.blocoAvaliacao, y);
    }
    if (data.conclusao) {
      y = addSection(pdf, 'Parecer Conclusivo', data.conclusao, y);
    }

    // Campos extras não mapeados — renderiza como seções genéricas
    const known = new Set(['resumoExecutivo', 'analisePedagogica', 'dificuldades', 'potencialidades', 'blocoAvaliacao', 'conclusao']);
    for (const [key, val] of Object.entries(data)) {
      if (known.has(key) || !val) continue;
      if (typeof val === 'string') {
        y = addSection(pdf, key.replace(/([A-Z])/g, ' $1').trim(), val as string, y);
      } else if (Array.isArray(val) && val.every((v: any) => typeof v === 'string')) {
        y = addListSection(pdf, key.replace(/([A-Z])/g, ' $1').trim(), val as string[], y, PETROL);
      }
    }
  }

  addSignatureArea(pdf, y);

  // Footers em todas as páginas
  const totalPages = (pdf as any).internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    pdf.setPage(i);
    addFooter(pdf, i, totalPages, doc.id);
  }

  const filename = `${docType}_${(student?.name || 'aluno').replace(/\s+/g, '_')}.pdf`;
  pdf.save(filename);
}
