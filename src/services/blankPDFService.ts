/**
 * blankPDFService.ts
 * Gera PDFs em branco para preenchimento manual.
 * Completamente separado do PDFGenerator.ts — não toca em PEI/PAEE/Estudo de Caso preenchidos.
 * Sem QR, sem código de auditoria, sem dados de aluno.
 */
import type { SchoolConfig } from '../types';

// ─── jsPDF (mesmo CDN do PDFGenerator) ───────────────────────────────────────
async function loadJsPDF(): Promise<any> {
  if ((window as any).jspdf?.jsPDF) return (window as any).jspdf.jsPDF;
  await new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    s.onload  = () => resolve();
    s.onerror = () => reject(new Error('Falha ao carregar jsPDF'));
    document.head.appendChild(s);
  });
  return (window as any).jspdf.jsPDF;
}

// ─── Constantes de layout A4 ──────────────────────────────────────────────────
const ML   = 15;          // margem esquerda
const MR   = 195;         // borda direita (210 - 15)
const TW   = 180;         // largura de texto
const PH   = 297;         // altura da página

// Paleta
const C_PETROL  : [number, number, number] = [31,  78,  95];
const C_GRAY    : [number, number, number] = [180, 187, 195];
const C_WARN    : [number, number, number] = [180,  83,   9];
const C_SECTION_BG : [number, number, number] = [239, 246, 255];
const C_TEXT    : [number, number, number] = [55,   65,  81];
const C_LIGHT   : [number, number, number] = [107, 114, 128];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Cabeçalho institucional — retorna y após o bloco */
function drawHeader(doc: any, school?: SchoolConfig): number {
  doc.setFillColor(...C_PETROL);
  doc.rect(0, 0, 210, 26, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(255, 255, 255);
  doc.text(school?.schoolName || 'Escola / Instituição', ML, 9.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  const cityState = [school?.city, school?.state].filter(Boolean).join(' — ');
  doc.text(cityState || 'Secretaria Municipal de Educação', ML, 15.5);
  doc.text('Educação Especial · Inclusão Escolar', ML, 20.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(190, 215, 225);
  doc.text('IncluiAI', MR, 20.5, { align: 'right' });

  return 31;
}

/** Título do documento com linha divisória */
function drawDocTitle(doc: any, title: string, subtitle: string, y: number): number {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...C_PETROL);
  doc.text(title, ML, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...C_LIGHT);
  doc.text(subtitle, ML, y + 6);

  doc.setDrawColor(...C_PETROL);
  doc.setLineWidth(0.6);
  doc.line(ML, y + 9.5, MR, y + 9.5);
  doc.setLineWidth(0.2);

  return y + 15;
}

/** Cabeçalho de seção com fundo azul claro */
function drawSection(doc: any, title: string, y: number): number {
  doc.setFillColor(...C_SECTION_BG);
  doc.rect(ML, y, TW, 6.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...C_PETROL);
  doc.text(title, ML + 2, y + 4.5);
  return y + 9;
}

/** Uma linha de campos em linha — fields é array de {label, width} */
function drawRow(
  doc: any,
  fields: Array<{ label: string; width: number }>,
  startX: number,
  y: number,
): number {
  let cx = startX;
  fields.forEach(({ label, width }) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...C_TEXT);
    doc.text(label, cx, y);
    const lw = doc.getTextWidth(label);
    doc.setDrawColor(...C_GRAY);
    doc.line(cx + lw + 0.5, y + 0.8, cx + width, y + 0.8);
    cx += width + 3;
  });
  return y + 6.5;
}

/** Campo simples de largura total */
function drawField(doc: any, label: string, y: number, endX = MR): number {
  return drawRow(doc, [{ label, width: endX - ML }], ML, y);
}

/** Área de texto livre com N linhas para escrever */
function drawTextArea(
  doc: any,
  label: string | null,
  y: number,
  lineCount: number,
  x = ML,
  width = TW,
): number {
  if (label) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...C_TEXT);
    doc.text(label, x, y);
    y += 4.5;
  }
  doc.setDrawColor(...C_GRAY);
  for (let i = 0; i < lineCount; i++) {
    doc.line(x, y + i * 5.5, x + width, y + i * 5.5);
  }
  return y + lineCount * 5.5 + 2;
}

/** Checkboxes em linha */
function drawCheckboxRow(
  doc: any,
  label: string,
  options: string[],
  y: number,
): number {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...C_TEXT);
  doc.text(label, ML, y);
  let cx = ML + doc.getTextWidth(label) + 3;
  doc.setFont('helvetica', 'normal');
  options.forEach(opt => {
    doc.setDrawColor(...C_GRAY);
    doc.rect(cx, y - 3.5, 3.5, 3.5);
    cx += 4.5;
    doc.setTextColor(...C_TEXT);
    doc.text(opt, cx, y);
    cx += doc.getTextWidth(opt) + 4;
  });
  return y + 6.5;
}

/** Linha de assinaturas */
function drawSignatureArea(doc: any, signatories: string[], y: number): number {
  const perW = TW / signatories.length;
  signatories.forEach((sig, i) => {
    const x = ML + i * perW;
    doc.setDrawColor(...C_GRAY);
    doc.line(x, y, x + perW - 5, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...C_LIGHT);
    doc.text(sig, x, y + 4.5);
    doc.text('Data: ___/___/_______', x, y + 10);
  });
  return y + 16;
}

/** Rodapé com aviso de modelo em branco */
function drawFooter(doc: any): void {
  const fy = PH - 11;
  doc.setDrawColor(...C_GRAY);
  doc.line(ML, fy - 3, MR, fy - 3);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...C_WARN);
  doc.text('[!] Modelo em branco — sem validade de autenticacao digital', ML, fy);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...C_LIGHT);
  doc.text('Gerado pelo IncluiAI · incluiai.com.br', MR, fy, { align: 'right' });
}

// ─── Guardrail: nova página se y ultrapassar limite ───────────────────────────
function ensurePage(doc: any, y: number, reserve = 50): number {
  if (y > PH - reserve) {
    doc.addPage();
    return 20;
  }
  return y;
}

// ═══════════════════════════════════════════════════════════════════════════════
// FICHA DO ALUNO EM BRANCO
// ═══════════════════════════════════════════════════════════════════════════════
export async function generateFichaAluno(school?: SchoolConfig): Promise<void> {
  const JsPDF = await loadJsPDF();
  const doc   = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  doc.setLineWidth(0.2);

  let y = drawHeader(doc, school);
  y     = drawDocTitle(doc, 'FICHA DO ALUNO', 'Documento para preenchimento à mão — Educação Especial / Inclusiva', y);

  // 1. Identificação
  y = drawSection(doc, '1. IDENTIFICAÇÃO DO ALUNO', y);
  y = drawField(doc, 'Nome completo:', y);
  y = drawRow(doc, [
    { label: 'Data de nascimento:', width: 40 },
    { label: 'Idade:', width: 18 },
    { label: 'Gênero:', width: 32 },
  ], ML, y);
  y = drawField(doc, 'Escola:', y);
  y = drawRow(doc, [
    { label: 'Série / Turma:', width: 38 },
    { label: 'Turno:', width: 25 },
    { label: 'Ano letivo:', width: 25 },
  ], ML, y);
  y = drawRow(doc, [
    { label: 'Professor(a) Regente:', width: 88 },
    { label: 'Prof.(a) AEE:', width: 88 },
  ], ML, y);
  y = drawField(doc, 'Coordenação / Gestor(a):', y);
  y += 1;

  // 2. Responsável
  y = drawSection(doc, '2. RESPONSÁVEL E CONTATO', y);
  y = drawField(doc, 'Nome do responsável:', y);
  y = drawRow(doc, [
    { label: 'Telefone:', width: 55 },
    { label: 'E-mail:', width: 122 },
  ], ML, y);
  y = drawField(doc, 'Endereço:', y);
  y += 1;

  // 3. Diagnóstico
  y = drawSection(doc, '3. DIAGNÓSTICO E SUPORTE', y);
  y = drawRow(doc, [
    { label: 'Diagnóstico principal:', width: 108 },
    { label: 'CID:', width: 68 },
  ], ML, y);
  y = drawField(doc, 'Diagnósticos secundários / comorbidades:', y);
  y = drawField(doc, 'Medicação em uso (nome e horário):', y);
  y = drawCheckboxRow(doc, 'Nível de suporte necessário:', ['Baixo', 'Médio', 'Alto'], y);
  y += 1;

  // 4. Perfil Pedagógico
  y = ensurePage(doc, y, 80);
  y = drawSection(doc, '4. PERFIL PEDAGÓGICO', y);
  y = drawTextArea(doc, 'Barreiras identificadas:', y, 3);
  y = drawTextArea(doc, 'Potencialidades:', y, 3);
  y = drawTextArea(doc, 'Interesses e preferências:', y, 2);
  y += 1;

  // 5. Histórico Escolar
  y = ensurePage(doc, y, 65);
  y = drawSection(doc, '5. HISTÓRICO ESCOLAR RESUMIDO', y);
  y = drawTextArea(doc, null, y, 3);
  y += 4;

  // Assinaturas
  y = ensurePage(doc, y, 45);
  y = drawSignatureArea(doc, ['Professor(a) AEE', 'Professor(a) Regente', 'Coordenação'], y);

  drawFooter(doc);
  doc.save('ficha-aluno-em-branco.pdf');
}

// ═══════════════════════════════════════════════════════════════════════════════
// REGISTRO DE ATENDIMENTO EM BRANCO
// ═══════════════════════════════════════════════════════════════════════════════
export async function generateRegistroAtendimento(school?: SchoolConfig): Promise<void> {
  const JsPDF = await loadJsPDF();
  const doc   = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  doc.setLineWidth(0.2);

  let y = drawHeader(doc, school);
  y     = drawDocTitle(doc, 'REGISTRO DE ATENDIMENTO', 'AEE — Atendimento Educacional Especializado', y);

  // Identificação
  y = drawSection(doc, 'IDENTIFICAÇÃO', y);
  y = drawRow(doc, [
    { label: 'Data:', width: 32 },
    { label: 'Horário:', width: 32 },
    { label: 'Local:', width: 110 },
  ], ML, y);
  y = drawField(doc, 'Aluno(a):', y);
  y = drawRow(doc, [
    { label: 'Profissional responsável:', width: 95 },
    { label: 'Especialidade:', width: 81 },
  ], ML, y);
  y = drawCheckboxRow(doc, 'Modalidade:', ['Individual', 'Pequeno grupo', 'Itinerante', 'Remoto'], y);
  y += 2;

  // Seções
  y = drawSection(doc, '1. OBJETIVO DO ATENDIMENTO', y);
  y = drawTextArea(doc, null, y, 2);
  y += 1;

  y = drawSection(doc, '2. ATIVIDADES REALIZADAS', y);
  y = drawTextArea(doc, null, y, 4);
  y += 1;

  y = drawSection(doc, '3. RESPOSTA / COMPORTAMENTO DO ALUNO', y);
  y = drawTextArea(doc, null, y, 3);
  y += 1;

  y = drawSection(doc, '4. ESTRATÉGIAS UTILIZADAS', y);
  y = drawTextArea(doc, null, y, 3);
  y += 1;

  y = ensurePage(doc, y, 80);
  y = drawSection(doc, '5. PRÓXIMOS ENCAMINHAMENTOS', y);
  y = drawTextArea(doc, null, y, 3);
  y += 1;

  y = drawSection(doc, '6. OBSERVAÇÕES', y);
  y = drawTextArea(doc, null, y, 2);
  y += 4;

  // Assinaturas
  y = ensurePage(doc, y, 45);
  y = drawSignatureArea(doc, ['Profissional responsável', 'Responsável pelo aluno(a)'], y);

  drawFooter(doc);
  doc.save('registro-atendimento-em-branco.pdf');
}

// ═══════════════════════════════════════════════════════════════════════════════
// OBSERVAÇÃO PEDAGÓGICA EM BRANCO
// ═══════════════════════════════════════════════════════════════════════════════
export async function generateObservacaoPedagogica(school?: SchoolConfig): Promise<void> {
  const JsPDF = await loadJsPDF();
  const doc   = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  doc.setLineWidth(0.2);

  let y = drawHeader(doc, school);
  y     = drawDocTitle(doc, 'OBSERVAÇÃO PEDAGÓGICA', 'Registro de observação do aluno em contexto educacional', y);

  // Identificação
  y = drawSection(doc, 'IDENTIFICAÇÃO', y);
  y = drawRow(doc, [
    { label: 'Data:', width: 32 },
    { label: 'Horário:', width: 32 },
    { label: 'Local:', width: 110 },
  ], ML, y);
  y = drawField(doc, 'Professor(a) observador(a):', y);
  y = drawRow(doc, [
    { label: 'Aluno(a) observado(a):', width: 110 },
    { label: 'Turma:', width: 65 },
  ], ML, y);
  y = drawField(doc, 'Situação / contexto observado:', y);
  y += 2;

  // Seções de observação
  y = drawSection(doc, '1. COMPORTAMENTO E INTERAÇÕES SOCIAIS', y);
  y = drawTextArea(doc, null, y, 3);
  y += 1;

  y = drawSection(doc, '2. PARTICIPAÇÃO NAS ATIVIDADES', y);
  y = drawTextArea(doc, null, y, 3);
  y += 1;

  y = drawSection(doc, '3. COMUNICAÇÃO E LINGUAGEM', y);
  y = drawTextArea(doc, null, y, 3);
  y += 1;

  y = ensurePage(doc, y, 100);
  y = drawSection(doc, '4. DIFICULDADES OBSERVADAS', y);
  y = drawTextArea(doc, null, y, 3);
  y += 1;

  y = drawSection(doc, '5. ESTRATÉGIAS QUE FUNCIONARAM', y);
  y = drawTextArea(doc, null, y, 3);
  y += 1;

  y = drawSection(doc, '6. RECOMENDAÇÕES', y);
  y = drawTextArea(doc, null, y, 3);
  y += 4;

  // Assinaturas
  y = ensurePage(doc, y, 45);
  y = drawSignatureArea(doc, ['Professor(a) observador(a)', 'Ciência do(a) Coordenador(a)'], y);

  drawFooter(doc);
  doc.save('observacao-pedagogica-em-branco.pdf');
}
