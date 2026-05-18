/**
 * blankPDFService.ts
 * Gera PDFs em branco para preenchimento manual — formato checklist.
 * Completamente separado do PDFGenerator.ts — não toca em PEI/PAEE/Estudo de Caso preenchidos.
 * Sem QR, sem código de auditoria, sem dados de aluno.
 */
import type { SchoolConfig } from '../types';

// ─── jsPDF ───────────────────────────────────────────────────────────────────
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

// ─── Layout A4 ────────────────────────────────────────────────────────────────
const ML  = 15;   // margem esquerda
const MR  = 195;  // borda direita (210 - 15)
const TW  = 180;  // largura de texto
const PH  = 297;  // altura da página

// Paleta
const C_PETROL     : [number, number, number] = [31,  78,  95];
const C_GRAY       : [number, number, number] = [180, 187, 195];
const C_WARN       : [number, number, number] = [180,  83,   9];
const C_SECTION_BG : [number, number, number] = [239, 246, 255];
const C_TEXT       : [number, number, number] = [55,  65,  81];
const C_LIGHT      : [number, number, number] = [107, 114, 128];

// ─── Helpers de layout ───────────────────────────────────────────────────────

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

function drawSection(doc: any, title: string, y: number): number {
  doc.setFillColor(...C_SECTION_BG);
  doc.rect(ML, y, TW, 6.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...C_PETROL);
  doc.text(title, ML + 2, y + 4.5);
  return y + 9;
}

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

function drawField(doc: any, label: string, y: number, endX = MR): number {
  return drawRow(doc, [{ label, width: endX - ML }], ML, y);
}

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

/**
 * Lista vertical de checkboxes.
 * Items que começam com "Outro:" ganham uma linha para escrita após o rótulo.
 * cols=2 distribui em duas colunas lado a lado.
 */
function drawCheckboxList(
  doc: any,
  items: string[],
  y: number,
  opts: { x?: number; cols?: number } = {},
): number {
  const x    = opts.x ?? ML;
  const cols = opts.cols ?? 1;
  const lineH = 5.5;
  const boxSz = 3.5;
  const colW  = TW / cols;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...C_TEXT);

  const rows = Math.ceil(items.length / cols);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const idx = row * cols + col;
      if (idx >= items.length) break;

      const cx  = x + col * colW;
      const cy  = y + row * lineH;

      doc.setDrawColor(...C_GRAY);
      doc.rect(cx, cy - boxSz + 0.5, boxSz, boxSz);

      const item = items[idx];
      if (item.startsWith('Outro:')) {
        doc.setFont('helvetica', 'italic');
        doc.text('Outro:', cx + boxSz + 2, cy);
        const tw = doc.getTextWidth('Outro:');
        const lineEnd = Math.min(cx + colW - 4, MR);
        doc.setDrawColor(...C_GRAY);
        doc.line(cx + boxSz + 3 + tw, cy + 0.8, lineEnd, cy + 0.8);
        doc.setFont('helvetica', 'normal');
      } else {
        doc.text(item, cx + boxSz + 2, cy);
      }
    }
  }

  return y + rows * lineH + 2;
}

function drawSectionLabel(doc: any, label: string, y: number): number {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...C_TEXT);
  doc.text(label, ML, y);
  return y + 5;
}

/** Linha com escala 1–5 de círculos — usada no Estudo de Caso */
function drawKnowledgeScale(doc: any, label: string, y: number): number {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...C_TEXT);
  doc.text(label, ML, y);
  const lw = doc.getTextWidth(label);
  let cx = ML + lw + 5;
  const cy = y - 2;
  for (let i = 1; i <= 5; i++) {
    doc.setDrawColor(...C_GRAY);
    doc.circle(cx, cy, 3, 'S');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(...C_PETROL);
    doc.text(String(i), cx, cy + 1.2, { align: 'center' });
    doc.setTextColor(...C_TEXT);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    cx += 9;
  }
  return y + 7;
}

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

function ensurePage(doc: any, y: number, reserve = 50): number {
  if (y > PH - reserve) {
    drawFooter(doc);
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
  y = drawDocTitle(doc, 'FICHA DO ALUNO', 'Documento para preenchimento à mão — Educação Especial / Inclusiva', y);

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
  y += 2;

  // 2. Responsável
  y = drawSection(doc, '2. RESPONSÁVEL E CONTATO', y);
  y = drawField(doc, 'Nome do responsável:', y);
  y = drawRow(doc, [
    { label: 'Telefone:', width: 55 },
    { label: 'E-mail:', width: 122 },
  ], ML, y);
  y = drawField(doc, 'Endereço:', y);
  y += 2;

  // 3. Diagnóstico e Suporte
  y = drawSection(doc, '3. DIAGNÓSTICO E SUPORTE', y);
  y = drawRow(doc, [
    { label: 'Diagnóstico principal:', width: 108 },
    { label: 'CID:', width: 68 },
  ], ML, y);
  y = drawField(doc, 'Diagnósticos secundários / comorbidades:', y);
  y = drawField(doc, 'Medicação em uso (nome e horário):', y);
  y += 1;

  y = drawSectionLabel(doc, 'Tipo de suporte necessário:', y);
  y = drawCheckboxList(doc, [
    'Sem suporte registrado',
    'Suporte leve',
    'Suporte moderado',
    'Suporte intenso',
  ], y, { cols: 2 });

  y = drawSectionLabel(doc, 'Documentos apresentados:', y);
  y = drawCheckboxList(doc, [
    'Laudo médico',
    'Relatório terapêutico',
    'Relatório escolar',
    'Anamnese',
    'Avaliação pedagógica',
    'Outro:',
  ], y, { cols: 2 });
  y += 1;

  // 4. Necessidades observadas
  y = ensurePage(doc, y, 70);
  y = drawSection(doc, '4. NECESSIDADES OBSERVADAS', y);
  y = drawCheckboxList(doc, [
    'Comunicação',
    'Autonomia',
    'Atenção / concentração',
    'Regulação emocional',
    'Interação social',
    'Leitura / escrita',
    'Raciocínio lógico-matemático',
    'Coordenação motora',
    'Sensorial',
  ], y, { cols: 2 });
  y += 1;

  // 5. Perfil Pedagógico
  y = ensurePage(doc, y, 80);
  y = drawSection(doc, '5. PERFIL PEDAGÓGICO', y);
  y = drawTextArea(doc, 'Barreiras identificadas:', y, 3);
  y = drawTextArea(doc, 'Potencialidades:', y, 3);
  y = drawTextArea(doc, 'Interesses e preferências:', y, 2);
  y += 1;

  // 6. Histórico escolar
  y = ensurePage(doc, y, 55);
  y = drawSection(doc, '6. HISTÓRICO ESCOLAR RESUMIDO', y);
  y = drawTextArea(doc, null, y, 3);
  y += 4;

  // Assinaturas
  y = ensurePage(doc, y, 45);
  y = drawSignatureArea(doc, ['Professor(a) AEE', 'Professor(a) Regente', 'Coordenação'], y);

  drawFooter(doc);
  doc.save('ficha-aluno-em-branco.pdf');
}

// ═══════════════════════════════════════════════════════════════════════════════
// REGISTRO DE ATENDIMENTO EM BRANCO — formato checklist
// ═══════════════════════════════════════════════════════════════════════════════
export async function generateRegistroAtendimento(school?: SchoolConfig): Promise<void> {
  const JsPDF = await loadJsPDF();
  const doc   = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  doc.setLineWidth(0.2);

  let y = drawHeader(doc, school);
  y = drawDocTitle(doc, 'REGISTRO DE ATENDIMENTO', 'AEE — Atendimento Educacional Especializado', y);

  // IDENTIFICAÇÃO
  y = drawSection(doc, 'IDENTIFICAÇÃO', y);
  y = drawRow(doc, [
    { label: 'Data:', width: 36 },
    { label: 'Horário:', width: 28 },
  ], ML, y);
  y = drawField(doc, 'Local:', y);
  y = drawField(doc, 'Aluno(a):', y);
  y = drawRow(doc, [
    { label: 'Profissional responsável:', width: 95 },
    { label: 'Especialidade:', width: 81 },
  ], ML, y);
  y += 1;
  y = drawSectionLabel(doc, 'Modalidade:', y);
  y = drawCheckboxList(doc, [
    'Individual',
    'Pequeno grupo',
    'Itinerante',
    'Remoto',
    'Orientação à família',
    'Observação em sala',
  ], y, { cols: 2 });
  y += 1;

  // OBJETIVO
  y = ensurePage(doc, y, 60);
  y = drawSection(doc, 'OBJETIVO DO ATENDIMENTO', y);
  y = drawCheckboxList(doc, [
    'Estimular comunicação',
    'Trabalhar autonomia',
    'Desenvolver atenção / concentração',
    'Apoiar leitura / escrita',
    'Apoiar raciocínio lógico-matemático',
    'Trabalhar regulação emocional',
    'Desenvolver interação social',
    'Orientar uso de recurso / adaptação',
    'Outro:',
  ], y, { cols: 2 });
  y += 1;

  // ATIVIDADES REALIZADAS
  y = ensurePage(doc, y, 70);
  y = drawSection(doc, 'ATIVIDADES REALIZADAS', y);
  y = drawCheckboxList(doc, [
    'Jogo pedagógico',
    'Atividade com material concreto',
    'Atividade visual',
    'Atividade de leitura / escrita',
    'Atividade motora',
    'Comunicação alternativa',
    'Recurso tecnológico',
    'Dinâmica de interação',
    'Orientação individual',
    'Outro:',
  ], y, { cols: 2 });
  y += 1;

  // RESPOSTA DO ALUNO
  y = ensurePage(doc, y, 75);
  y = drawSection(doc, 'RESPOSTA DO ALUNO', y);
  y = drawCheckboxList(doc, [
    'Participou com autonomia',
    'Participou com mediação',
    'Demonstrou interesse',
    'Demonstrou resistência',
    'Necessitou de pausa',
    'Dificuldade de compreensão',
    'Melhora durante a atividade',
    'Recusou atividade',
    'Oscilou atenção',
    'Precisou de apoio constante',
  ], y, { cols: 2 });
  y += 1;

  // ESTRATÉGIAS UTILIZADAS
  y = ensurePage(doc, y, 75);
  y = drawSection(doc, 'ESTRATÉGIAS UTILIZADAS', y);
  y = drawCheckboxList(doc, [
    'Comando curto',
    'Suporte visual',
    'Rotina previsível',
    'Reforço positivo',
    'Pausa sensorial',
    'Tempo ampliado',
    'Redução de estímulos',
    'Mediação individual',
    'Material adaptado',
    'Pareamento com colega / adulto',
  ], y, { cols: 2 });
  y += 1;

  // PRÓXIMOS ENCAMINHAMENTOS
  y = ensurePage(doc, y, 65);
  y = drawSection(doc, 'PRÓXIMOS ENCAMINHAMENTOS', y);
  y = drawCheckboxList(doc, [
    'Manter estratégia',
    'Ajustar atividade',
    'Reforçar habilidade',
    'Orientar família',
    'Orientar professor regente',
    'Encaminhar para coordenação',
    'Registrar nova observação',
    'Reavaliar na próxima semana',
  ], y, { cols: 2 });
  y += 1;

  // OBSERVAÇÕES
  y = ensurePage(doc, y, 50);
  y = drawSection(doc, 'OBSERVAÇÕES', y);
  y = drawTextArea(doc, null, y, 3);
  y += 4;

  // Assinaturas
  y = ensurePage(doc, y, 45);
  y = drawSignatureArea(doc, ['Profissional responsável', 'Responsável pelo aluno(a)'], y);

  drawFooter(doc);
  doc.save('registro-atendimento-em-branco.pdf');
}

// ═══════════════════════════════════════════════════════════════════════════════
// OBSERVAÇÃO PEDAGÓGICA EM BRANCO — formato checklist
// ═══════════════════════════════════════════════════════════════════════════════
export async function generateObservacaoPedagogica(school?: SchoolConfig): Promise<void> {
  const JsPDF = await loadJsPDF();
  const doc   = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  doc.setLineWidth(0.2);

  let y = drawHeader(doc, school);
  y = drawDocTitle(doc, 'OBSERVAÇÃO PEDAGÓGICA', 'Registro de observação do aluno em contexto educacional', y);

  // IDENTIFICAÇÃO
  y = drawSection(doc, 'IDENTIFICAÇÃO', y);
  y = drawRow(doc, [
    { label: 'Data:', width: 36 },
    { label: 'Horário:', width: 28 },
    { label: 'Turma:', width: 36 },
  ], ML, y);
  y = drawField(doc, 'Aluno(a):', y);
  y = drawField(doc, 'Professor(a) observador(a):', y);
  y += 1;
  y = drawSectionLabel(doc, 'Situação / contexto observado:', y);
  y = drawCheckboxList(doc, [
    'Aula expositiva',
    'Atividade individual',
    'Atividade em grupo',
    'Recreio',
    'Entrada / saída',
    'Avaliação',
    'Atendimento individual',
    'Outro:',
  ], y, { cols: 2 });
  y += 1;

  // ATENÇÃO E PARTICIPAÇÃO
  y = ensurePage(doc, y, 65);
  y = drawSection(doc, 'ATENÇÃO E PARTICIPAÇÃO', y);
  y = drawCheckboxList(doc, [
    'Mantém atenção por curto período',
    'Mantém atenção com mediação',
    'Distrai-se facilmente',
    'Participa espontaneamente',
    'Participa quando chamado',
    'Evita participação',
    'Necessita de comandos repetidos',
    'Finaliza atividades',
    'Abandona atividades sem concluir',
  ], y, { cols: 2 });
  y += 1;

  // COMUNICAÇÃO
  y = ensurePage(doc, y, 70);
  y = drawSection(doc, 'COMUNICAÇÃO', y);
  y = drawCheckboxList(doc, [
    'Comunica necessidades verbalmente',
    'Usa gestos / apontar',
    'Usa frases curtas',
    'Dificuldade para pedir ajuda',
    'Responde comandos simples',
    'Compreensão parcial',
    'Necessita de apoio visual',
    'Apresenta ecolalia / repetições',
    'Não se comunica espontaneamente',
  ], y, { cols: 2 });
  y += 1;

  // INTERAÇÃO SOCIAL
  y = ensurePage(doc, y, 65);
  y = drawSection(doc, 'INTERAÇÃO SOCIAL', y);
  y = drawCheckboxList(doc, [
    'Interage com colegas',
    'Prefere ficar sozinho',
    'Busca adultos',
    'Aceita ajuda',
    'Compartilha materiais',
    'Tem conflitos frequentes',
    'Demonstra frustração',
    'Segue combinados com apoio',
    'Participa de atividades coletivas',
  ], y, { cols: 2 });
  y += 1;

  // AUTONOMIA
  y = ensurePage(doc, y, 65);
  y = drawSection(doc, 'AUTONOMIA', y);
  y = drawCheckboxList(doc, [
    'Organiza materiais',
    'Precisa de ajuda para iniciar',
    'Precisa de ajuda para concluir',
    'Pede ajuda quando necessário',
    'Usa banheiro com autonomia',
    'Alimenta-se com autonomia',
    'Desloca-se com segurança',
    'Necessita de supervisão constante',
  ], y, { cols: 2 });
  y += 1;

  // APRENDIZAGEM
  y = ensurePage(doc, y, 65);
  y = drawSection(doc, 'APRENDIZAGEM', y);
  y = drawCheckboxList(doc, [
    'Reconhece letras / números',
    'Lê palavras / frases',
    'Copia do quadro',
    'Registra respostas',
    'Compreende instruções',
    'Resolve atividades simples',
    'Necessita de adaptação',
    'Necessita de material concreto',
    'Demonstra conhecimento prévio',
  ], y, { cols: 2 });
  y += 1;

  // COMPORTAMENTO E REGULAÇÃO
  y = ensurePage(doc, y, 70);
  y = drawSection(doc, 'COMPORTAMENTO E REGULAÇÃO', y);
  y = drawCheckboxList(doc, [
    'Mantém-se tranquilo',
    'Apresenta agitação motora',
    'Demonstra ansiedade',
    'Apresenta irritabilidade',
    'Chora com facilidade',
    'Apresenta recusa',
    'Necessita de pausa',
    'Regula-se com apoio',
    'Reage bem a rotina visual',
  ], y, { cols: 2 });
  y += 1;

  // ESTRATÉGIAS QUE FUNCIONARAM
  y = ensurePage(doc, y, 65);
  y = drawSection(doc, 'ESTRATÉGIAS QUE FUNCIONARAM', y);
  y = drawCheckboxList(doc, [
    'Comando curto',
    'Suporte visual',
    'Material concreto',
    'Reforço positivo',
    'Pausa programada',
    'Redução de estímulos',
    'Tempo ampliado',
    'Atividade em etapas',
    'Mediação individual',
  ], y, { cols: 2 });
  y += 1;

  // RECOMENDAÇÕES IMEDIATAS
  y = ensurePage(doc, y, 65);
  y = drawSection(doc, 'RECOMENDAÇÕES IMEDIATAS', y);
  y = drawCheckboxList(doc, [
    'Manter rotina visual',
    'Adaptar atividade',
    'Reduzir quantidade de itens',
    'Oferecer apoio individual',
    'Usar material concreto',
    'Registrar nova observação',
    'Conversar com família',
    'Encaminhar para AEE',
    'Solicitar estudo de caso',
  ], y, { cols: 2 });
  y += 1;

  // OBSERVAÇÕES LIVRES
  y = ensurePage(doc, y, 50);
  y = drawSection(doc, 'OBSERVAÇÕES LIVRES', y);
  y = drawTextArea(doc, null, y, 3);
  y += 4;

  // Assinaturas
  y = ensurePage(doc, y, 45);
  y = drawSignatureArea(doc, ['Professor(a) observador(a)', 'Ciência do(a) Coordenador(a)'], y);

  drawFooter(doc);
  doc.save('observacao-pedagogica-em-branco.pdf');
}

// ═══════════════════════════════════════════════════════════════════════════════
// PEI EM BRANCO — Plano Educacional Individualizado
// ═══════════════════════════════════════════════════════════════════════════════
export async function generateBlankPEIPDF(school?: SchoolConfig): Promise<void> {
  const JsPDF = await loadJsPDF();
  const doc   = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  doc.setLineWidth(0.2);

  let y = drawHeader(doc, school);
  y = drawDocTitle(doc, 'PEI — PLANO EDUCACIONAL INDIVIDUALIZADO', 'Modelo em branco para preenchimento manual', y);

  // 1. Identificação
  y = drawSection(doc, '1. IDENTIFICAÇÃO DO ALUNO', y);
  y = drawField(doc, 'Nome completo:', y);
  y = drawRow(doc, [
    { label: 'Data de nascimento:', width: 40 },
    { label: 'Idade:', width: 18 },
  ], ML, y);
  y = drawField(doc, 'Escola:', y);
  y = drawRow(doc, [
    { label: 'Série / Ano:', width: 38 },
    { label: 'Turno:', width: 25 },
  ], ML, y);
  y = drawRow(doc, [
    { label: 'Professor(a) regente:', width: 88 },
    { label: 'Profissional AEE:', width: 88 },
  ], ML, y);
  y = drawField(doc, 'Responsável legal:', y);
  y += 2;

  // 2. Diagnóstico
  y = ensurePage(doc, y, 60);
  y = drawSection(doc, '2. DIAGNÓSTICO / CONDIÇÃO INFORMADA', y);
  y = drawRow(doc, [
    { label: 'Diagnóstico:', width: 108 },
    { label: 'CID:', width: 68 },
  ], ML, y);
  y = drawSectionLabel(doc, 'Nível de suporte:', y);
  y = drawCheckboxList(doc, [
    'Sem suporte registrado', 'Suporte leve', 'Suporte moderado', 'Suporte intenso',
  ], y, { cols: 2 });
  y = drawTextArea(doc, 'Observações relevantes:', y, 2);
  y += 1;

  // 3. Perfil pedagógico
  y = ensurePage(doc, y, 65);
  y = drawSection(doc, '3. PERFIL PEDAGÓGICO INICIAL', y);
  y = drawSectionLabel(doc, 'Áreas de atenção:', y);
  y = drawCheckboxList(doc, [
    'Comunicação', 'Atenção',
    'Autonomia', 'Interação social',
    'Leitura', 'Escrita',
    'Matemática', 'Coordenação motora',
    'Regulação emocional', 'Sensorial',
  ], y, { cols: 2 });
  y = drawTextArea(doc, 'Observações:', y, 2);
  y += 1;

  // 4. Barreiras
  y = ensurePage(doc, y, 60);
  y = drawSection(doc, '4. BARREIRAS IDENTIFICADAS', y);
  y = drawCheckboxList(doc, [
    'Barreiras de comunicação', 'Barreiras pedagógicas',
    'Barreiras atitudinais', 'Barreiras sensoriais',
    'Barreiras físicas', 'Barreiras tecnológicas',
    'Barreiras sociais', 'Outras',
  ], y, { cols: 2 });
  y += 1;

  // 5. Objetivos
  y = ensurePage(doc, y, 55);
  y = drawSection(doc, '5. OBJETIVOS EDUCACIONAIS', y);
  y = drawField(doc, 'Objetivo geral:', y);
  y = drawField(doc, 'Objetivo específico 1:', y);
  y = drawField(doc, 'Objetivo específico 2:', y);
  y = drawField(doc, 'Objetivo específico 3:', y);
  y += 1;

  // 6. Adaptações e estratégias
  y = ensurePage(doc, y, 70);
  y = drawSection(doc, '6. ADAPTAÇÕES E ESTRATÉGIAS', y);
  y = drawCheckboxList(doc, [
    'Redução de quantidade de itens', 'Tempo ampliado',
    'Recurso visual', 'Material concreto',
    'Atividade em etapas', 'Mediação individual',
    'Pareamento com colega', 'Rotina visual',
    'Comunicação alternativa', 'Avaliação adaptada',
  ], y, { cols: 2 });
  y += 1;

  // 7. Recursos
  y = ensurePage(doc, y, 55);
  y = drawSection(doc, '7. RECURSOS NECESSÁRIOS', y);
  y = drawCheckboxList(doc, [
    'Prancha visual', 'Material concreto',
    'Tecnologia assistiva', 'Caderno adaptado',
    'Jogos pedagógicos', 'Apoio humano', 'Outros',
  ], y, { cols: 2 });
  y += 1;

  // 8. Avaliação
  y = ensurePage(doc, y, 60);
  y = drawSection(doc, '8. AVALIAÇÃO E ACOMPANHAMENTO', y);
  y = drawTextArea(doc, 'Como será avaliado:', y, 2);
  y = drawRow(doc, [
    { label: 'Frequência de acompanhamento:', width: 88 },
    { label: 'Próxima revisão:', width: 88 },
  ], ML, y);
  y = drawField(doc, 'Responsáveis:', y);
  y += 4;

  // Assinaturas
  y = ensurePage(doc, y, 45);
  y = drawSignatureArea(doc, ['Prof.(a) Regente', 'Profissional AEE', 'Coordenação', 'Responsável Legal'], y);

  drawFooter(doc);
  doc.save('pei-em-branco.pdf');
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAEE EM BRANCO — Plano de Atendimento Educacional Especializado
// ═══════════════════════════════════════════════════════════════════════════════
export async function generateBlankPAEEPDF(school?: SchoolConfig): Promise<void> {
  const JsPDF = await loadJsPDF();
  const doc   = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  doc.setLineWidth(0.2);

  let y = drawHeader(doc, school);
  y = drawDocTitle(doc, 'PAEE — PLANO DE ATENDIMENTO EDUCACIONAL ESPECIALIZADO', 'Modelo em branco para preenchimento manual', y);

  // 1. Identificação
  y = drawSection(doc, '1. IDENTIFICAÇÃO', y);
  y = drawField(doc, 'Nome do aluno:', y);
  y = drawField(doc, 'Escola:', y);
  y = drawRow(doc, [
    { label: 'Série / Ano:', width: 38 },
    { label: 'Turno:', width: 25 },
  ], ML, y);
  y = drawField(doc, 'Profissional AEE:', y);
  y = drawRow(doc, [
    { label: 'Período do atendimento:', width: 88 },
    { label: 'Frequência:', width: 88 },
  ], ML, y);
  y += 2;

  // 2. Necessidades
  y = ensurePage(doc, y, 70);
  y = drawSection(doc, '2. NECESSIDADES EDUCACIONAIS ESPECÍFICAS', y);
  y = drawCheckboxList(doc, [
    'Comunicação', 'Autonomia',
    'Acessibilidade', 'Interação social',
    'Atenção', 'Regulação emocional',
    'Recursos sensoriais', 'Tecnologia assistiva',
    'Organização da rotina', 'Desenvolvimento acadêmico',
  ], y, { cols: 2 });
  y += 1;

  // 3. Barreiras
  y = ensurePage(doc, y, 60);
  y = drawSection(doc, '3. BARREIRAS OBSERVADAS', y);
  y = drawCheckboxList(doc, [
    'Comunicação', 'Atitudinal',
    'Pedagógica', 'Sensorial',
    'Física', 'Tecnológica',
    'Curricular', 'Social',
  ], y, { cols: 2 });
  y += 1;

  // 4. Objetivos
  y = ensurePage(doc, y, 50);
  y = drawSection(doc, '4. OBJETIVOS DO AEE', y);
  y = drawField(doc, 'Objetivo 1:', y);
  y = drawField(doc, 'Objetivo 2:', y);
  y = drawField(doc, 'Objetivo 3:', y);
  y += 1;

  // 5. Recursos e estratégias
  y = ensurePage(doc, y, 75);
  y = drawSection(doc, '5. RECURSOS E ESTRATÉGIAS DO AEE', y);
  y = drawCheckboxList(doc, [
    'Comunicação alternativa', 'Prancha visual',
    'Material tátil', 'Jogos estruturados',
    'Rotina visual', 'Tecnologia assistiva',
    'Adaptação de material', 'Treino de autonomia',
    'Orientação ao professor regente', 'Orientação à família',
  ], y, { cols: 2 });
  y += 1;

  // 6. Articulação com sala comum
  y = ensurePage(doc, y, 65);
  y = drawSection(doc, '6. ARTICULAÇÃO COM A SALA COMUM', y);
  y = drawTextArea(doc, 'Estratégias para o professor regente:', y, 2);
  y = drawTextArea(doc, 'Orientações para adaptação de atividades:', y, 2);
  y = drawTextArea(doc, 'Comunicação entre AEE e sala comum:', y, 2);
  y += 1;

  // 7. Monitoramento
  y = ensurePage(doc, y, 60);
  y = drawSection(doc, '7. MONITORAMENTO', y);
  y = drawTextArea(doc, 'Como será acompanhado:', y, 2);
  y = drawRow(doc, [
    { label: 'Frequência:', width: 55 },
    { label: 'Próxima revisão:', width: 120 },
  ], ML, y);
  y = drawTextArea(doc, 'Indicadores de evolução:', y, 2);
  y += 4;

  // Assinaturas
  y = ensurePage(doc, y, 45);
  y = drawSignatureArea(doc, ['Profissional AEE', 'Prof.(a) Regente', 'Coordenação', 'Responsável Legal'], y);

  drawFooter(doc);
  doc.save('paee-em-branco.pdf');
}

// ═══════════════════════════════════════════════════════════════════════════════
// PDI EM BRANCO — Plano de Desenvolvimento Individual
// ═══════════════════════════════════════════════════════════════════════════════
export async function generateBlankPDIPDF(school?: SchoolConfig): Promise<void> {
  const JsPDF = await loadJsPDF();
  const doc   = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  doc.setLineWidth(0.2);

  let y = drawHeader(doc, school);
  y = drawDocTitle(doc, 'PDI — PLANO DE DESENVOLVIMENTO INDIVIDUAL', 'Modelo em branco para preenchimento manual', y);

  // 1. Identificação
  y = drawSection(doc, '1. IDENTIFICAÇÃO', y);
  y = drawField(doc, 'Nome:', y);
  y = drawField(doc, 'Escola:', y);
  y = drawRow(doc, [
    { label: 'Série / Ano:', width: 38 },
    { label: 'Data:', width: 36 },
  ], ML, y);
  y = drawField(doc, 'Responsáveis pelo acompanhamento:', y);
  y += 2;

  // 2. Situação inicial
  y = ensurePage(doc, y, 80);
  y = drawSection(doc, '2. SITUAÇÃO INICIAL', y);
  y = drawTextArea(doc, 'Potencialidades:', y, 2);
  y = drawTextArea(doc, 'Dificuldades:', y, 2);
  y = drawTextArea(doc, 'Necessidades de apoio:', y, 2);
  y = drawTextArea(doc, 'Observações iniciais:', y, 2);
  y += 1;

  // 3. Áreas de desenvolvimento
  y = ensurePage(doc, y, 60);
  y = drawSection(doc, '3. ÁREAS DE DESENVOLVIMENTO', y);
  y = drawCheckboxList(doc, [
    'Comunicação', 'Cognitivo',
    'Motor', 'Socioemocional',
    'Autonomia', 'Acadêmico',
    'Sensorial', 'Comportamental',
  ], y, { cols: 2 });
  y += 1;

  // 4. Metas de curto prazo
  y = ensurePage(doc, y, 50);
  y = drawSection(doc, '4. METAS DE CURTO PRAZO', y);
  y = drawField(doc, 'Meta 1:', y);
  y = drawField(doc, 'Meta 2:', y);
  y = drawField(doc, 'Meta 3:', y);
  y += 1;

  // 5. Metas de médio/longo prazo
  y = ensurePage(doc, y, 50);
  y = drawSection(doc, '5. METAS DE MÉDIO / LONGO PRAZO', y);
  y = drawField(doc, 'Meta 1:', y);
  y = drawField(doc, 'Meta 2:', y);
  y = drawField(doc, 'Meta 3:', y);
  y += 1;

  // 6. Estratégias
  y = ensurePage(doc, y, 70);
  y = drawSection(doc, '6. ESTRATÉGIAS DE INTERVENÇÃO', y);
  y = drawCheckboxList(doc, [
    'Atividades lúdicas', 'Jogos pedagógicos',
    'Material concreto', 'Apoio visual',
    'Rotina estruturada', 'Mediação individual',
    'Reforço positivo', 'Adaptação de tarefa',
    'Atividades motoras', 'Intervenção socioemocional',
  ], y, { cols: 2 });
  y += 1;

  // 7. Indicadores de progresso
  y = ensurePage(doc, y, 60);
  y = drawSection(doc, '7. INDICADORES DE PROGRESSO', y);
  y = drawTextArea(doc, 'O que observar:', y, 2);
  y = drawTextArea(doc, 'Como registrar:', y, 2);
  y = drawRow(doc, [
    { label: 'Frequência de avaliação:', width: 88 },
  ], ML, y);
  y += 1;

  // 8. Revisão do plano
  y = ensurePage(doc, y, 50);
  y = drawSection(doc, '8. REVISÃO DO PLANO', y);
  y = drawRow(doc, [
    { label: 'Data da revisão:', width: 55 },
    { label: 'Responsável:', width: 120 },
  ], ML, y);
  y = drawTextArea(doc, 'Encaminhamentos:', y, 2);
  y += 4;

  // Assinaturas
  y = ensurePage(doc, y, 45);
  y = drawSignatureArea(doc, ['Profissional AEE', 'Prof.(a) Regente', 'Coordenação', 'Responsável Legal'], y);

  drawFooter(doc);
  doc.save('pdi-em-branco.pdf');
}

// ═══════════════════════════════════════════════════════════════════════════════
// ESTUDO DE CASO EM BRANCO — modelo completo, 14 seções
// ═══════════════════════════════════════════════════════════════════════════════
export async function generateBlankEstudoCasoPDF(school?: SchoolConfig): Promise<void> {
  const JsPDF = await loadJsPDF();
  const doc   = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  doc.setLineWidth(0.2);

  let y = drawHeader(doc, school);
  y = drawDocTitle(doc, 'ESTUDO DE CASO — EDUCAÇÃO ESPECIAL INCLUSIVA', 'Modelo em branco para preenchimento manual', y);

  // 1. Identificação do aluno
  y = drawSection(doc, '1. IDENTIFICAÇÃO DO ALUNO', y);
  y = drawField(doc, 'Nome:', y);
  y = drawRow(doc, [
    { label: 'Nascimento:', width: 40 },
    { label: 'Idade:', width: 18 },
  ], ML, y);
  y = drawField(doc, 'Escola:', y);
  y = drawRow(doc, [
    { label: 'Série / Ano:', width: 38 },
    { label: 'Turno:', width: 25 },
  ], ML, y);
  y = drawRow(doc, [
    { label: 'Responsável:', width: 88 },
    { label: 'Contato:', width: 88 },
  ], ML, y);
  y = drawRow(doc, [
    { label: 'Diagnóstico / CID:', width: 108 },
    { label: 'Nível de suporte:', width: 68 },
  ], ML, y);
  y += 2;

  // 2. Dados institucionais
  y = ensurePage(doc, y, 55);
  y = drawSection(doc, '2. DADOS INSTITUCIONAIS', y);
  y = drawRow(doc, [
    { label: 'Professor(a) regente:', width: 88 },
    { label: 'Profissional AEE:', width: 88 },
  ], ML, y);
  y = drawRow(doc, [
    { label: 'Coordenação:', width: 88 },
    { label: 'Profissionais externos:', width: 88 },
  ], ML, y);
  y = drawRow(doc, [
    { label: 'Data de elaboração:', width: 55 },
  ], ML, y);
  y += 2;

  // 3. Motivo do estudo de caso
  y = ensurePage(doc, y, 58);
  y = drawSection(doc, '3. MOTIVO DO ESTUDO DE CASO', y);
  y = drawTextArea(doc, 'Demanda principal:', y, 2);
  y = drawRow(doc, [{ label: 'Quem solicitou:', width: 88 }], ML, y);
  y = drawTextArea(doc, 'Situação observada:', y, 2);
  y += 1;

  // 4. Histórico de escolarização
  y = ensurePage(doc, y, 62);
  y = drawSection(doc, '4. HISTÓRICO DE ESCOLARIZAÇÃO', y);
  y = drawTextArea(doc, 'Trajetória escolar:', y, 2);
  y = drawRow(doc, [
    { label: 'Trocas de escola:', width: 55 },
    { label: 'Repetências:', width: 36 },
    { label: 'Frequência:', width: 85 },
  ], ML, y);
  y = drawTextArea(doc, 'Observações:', y, 2);
  y += 1;

  // 5. Entrevista com responsável
  y = ensurePage(doc, y, 75);
  y = drawSection(doc, '5. ENTREVISTA COM RESPONSÁVEL / FAMÍLIA', y);
  y = drawTextArea(doc, 'Informações trazidas pela família:', y, 2);
  y = drawTextArea(doc, 'Rotina em casa:', y, 2);
  y = drawTextArea(doc, 'Comunicação:', y, 2);
  y = drawField(doc, 'Saúde / medicação:', y);
  y = drawTextArea(doc, 'Observações:', y, 2);
  y += 1;

  // 6. Fontes de informação
  y = ensurePage(doc, y, 65);
  y = drawSection(doc, '6. FONTES DE INFORMAÇÃO UTILIZADAS', y);
  y = drawCheckboxList(doc, [
    'Ficha do aluno', 'Entrevista familiar',
    'Observação pedagógica', 'Laudos / documentos clínicos',
    'Perfil pedagógico', 'Registros evolutivos',
    'Atendimento AEE', 'Relato da cuidadora',
    'Outro:',
  ], y, { cols: 2 });
  y += 1;

  // 7. Informações de saúde
  y = ensurePage(doc, y, 60);
  y = drawSection(doc, '7. INFORMAÇÕES DE SAÚDE', y);
  y = drawRow(doc, [
    { label: 'Diagnóstico:', width: 108 },
    { label: 'CID:', width: 68 },
  ], ML, y);
  y = drawField(doc, 'Medicação em uso:', y);
  y = drawField(doc, 'Profissionais que acompanham:', y);
  y = drawTextArea(doc, 'Recomendações clínicas relevantes:', y, 2);
  y += 1;

  // 8. Necessidades de apoio
  y = ensurePage(doc, y, 65);
  y = drawSection(doc, '8. NECESSIDADES DE APOIO', y);
  y = drawCheckboxList(doc, [
    'Atenção', 'Comunicação',
    'Leitura / escrita', 'Matemática',
    'Autonomia', 'Interação social',
    'Regulação emocional', 'Sensorial',
    'Motricidade', 'Rotina',
  ], y, { cols: 2 });
  y += 1;

  // 9. Dados pedagógicos
  y = ensurePage(doc, y, 75);
  y = drawSection(doc, '9. DADOS PEDAGÓGICOS', y);
  y = drawTextArea(doc, 'Potencialidades:', y, 2);
  y = drawTextArea(doc, 'Dificuldades:', y, 2);
  y = drawTextArea(doc, 'Estratégias que funcionam:', y, 2);
  y = drawTextArea(doc, 'Barreiras observadas:', y, 2);
  y += 1;

  // 10. Conhecimento prévio — escala
  y = ensurePage(doc, y, 60);
  y = drawSection(doc, '10. CONHECIMENTO PRÉVIO  (escala: 1 = não consolidado · 5 = consolidado)', y);
  for (const item of ['Leitura', 'Escrita', 'Compreensão', 'Autonomia', 'Atenção', 'Raciocínio lógico']) {
    y = drawKnowledgeScale(doc, item + ':', y);
  }
  y += 1;

  // 11. Análise pedagógica
  y = ensurePage(doc, y, 55);
  y = drawSection(doc, '11. ANÁLISE PEDAGÓGICA INTEGRADA', y);
  y = drawTextArea(doc, null, y, 4);
  y += 1;

  // 12. Estratégias recomendadas
  y = ensurePage(doc, y, 70);
  y = drawSection(doc, '12. ESTRATÉGIAS RECOMENDADAS', y);
  y = drawCheckboxList(doc, [
    'Rotina visual', 'Comandos objetivos',
    'Atividade em etapas', 'Tempo ampliado',
    'Material concreto', 'Apoio visual',
    'Pausas programadas', 'Reforço positivo',
    'Adaptação curricular', 'Mediação individual',
  ], y, { cols: 2 });
  y += 1;

  // 13. Encaminhamentos
  y = ensurePage(doc, y, 75);
  y = drawSection(doc, '13. ENCAMINHAMENTOS', y);
  for (let i = 1; i <= 3; i++) {
    y = drawField(doc, `Encaminhamento ${i}:`, y);
    y = drawRow(doc, [
      { label: 'Responsável:', width: 85 },
      { label: 'Prazo:', width: 91 },
    ], ML, y);
    y = drawField(doc, 'Obs:', y);
    y += 2;
  }

  // 14. Conclusão técnica
  y = ensurePage(doc, y, 55);
  y = drawSection(doc, '14. CONCLUSÃO TÉCNICA PEDAGÓGICA', y);
  y = drawTextArea(doc, null, y, 4);
  y += 4;

  // Assinaturas — duas linhas
  y = ensurePage(doc, y, 50);
  y = drawSignatureArea(doc, ['Profissional responsável', 'Prof.(a) Regente', 'Profissional AEE'], y);
  y = ensurePage(doc, y, 30);
  y = drawSignatureArea(doc, ['Coordenação', 'Responsável legal'], y);

  drawFooter(doc);
  doc.save('estudo-de-caso-em-branco.pdf');
}

// ═══════════════════════════════════════════════════════════════════════════════
// PLANO DE AÇÃO DO PROFESSOR REGENTE EM BRANCO
// ═══════════════════════════════════════════════════════════════════════════════
export async function generateBlankRegentActionPlanPDF(school?: SchoolConfig): Promise<void> {
  const JsPDF = await loadJsPDF();
  const doc   = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  doc.setLineWidth(0.2);

  let y = drawHeader(doc, school);
  y = drawDocTitle(doc, 'PLANO DE AÇÃO DO PROFESSOR REGENTE', 'Modelo em branco para preenchimento manual', y);

  // 1. Identificação
  y = drawSection(doc, '1. IDENTIFICAÇÃO', y);
  y = drawField(doc, 'Nome do aluno:', y);
  y = drawField(doc, 'Escola:', y);
  y = drawRow(doc, [
    { label: 'Série / Ano:', width: 38 },
    { label: 'Professor(a) regente:', width: 138 },
  ], ML, y);
  y += 1;
  y = drawSectionLabel(doc, 'Período:', y);
  y = drawCheckboxList(doc, ['Semanal', 'Quinzenal', 'Mensal', 'Bimestral'], y, { cols: 2 });
  y = drawRow(doc, [
    { label: 'Data de início:', width: 55 },
    { label: 'Data de revisão:', width: 120 },
  ], ML, y);
  y += 2;

  // 2. Foco do plano
  y = ensurePage(doc, y, 70);
  y = drawSection(doc, '2. FOCO DO PLANO', y);
  y = drawCheckboxList(doc, [
    'Atenção / concentração', 'Comunicação',
    'Participação', 'Leitura / escrita',
    'Matemática', 'Autonomia',
    'Interação social', 'Regulação emocional',
    'Organização da rotina', 'Adaptação de atividades',
  ], y, { cols: 2 });
  y += 1;

  // 3. Objetivo prático
  y = ensurePage(doc, y, 50);
  y = drawSection(doc, '3. OBJETIVO PRÁTICO DO PERÍODO', y);
  y = drawTextArea(doc, null, y, 3);
  y += 1;

  // 4. Ações em sala
  y = ensurePage(doc, y, 75);
  y = drawSection(doc, '4. AÇÕES EM SALA DE AULA', y);
  y = drawCheckboxList(doc, [
    'Sentar próximo ao professor', 'Dar comandos curtos',
    'Dividir atividade em etapas', 'Reduzir quantidade de itens',
    'Usar apoio visual', 'Usar material concreto',
    'Permitir tempo ampliado', 'Oferecer pausa programada',
    'Parear com colega tutor', 'Registrar evidências',
  ], y, { cols: 2 });
  y += 1;

  // 5. Atividades sugeridas
  y = ensurePage(doc, y, 50);
  y = drawSection(doc, '5. ATIVIDADES SUGERIDAS', y);
  y = drawField(doc, 'Atividade 1:', y);
  y = drawField(doc, 'Atividade 2:', y);
  y = drawField(doc, 'Atividade 3:', y);
  y += 1;

  // 6. Recursos
  y = ensurePage(doc, y, 70);
  y = drawSection(doc, '6. RECURSOS', y);
  y = drawCheckboxList(doc, [
    'Cartões visuais', 'Rotina visual',
    'Alfabeto móvel', 'Material dourado',
    'Jogos pedagógicos', 'Prancha de comunicação',
    'Vídeo curto', 'Música',
    'Material concreto', 'Tecnologia assistiva',
  ], y, { cols: 2 });
  y += 1;

  // 7. Registro da resposta
  y = ensurePage(doc, y, 65);
  y = drawSection(doc, '7. REGISTRO DA RESPOSTA DO ALUNO', y);
  y = drawCheckboxList(doc, [
    'Realizou com autonomia', 'Realizou com mediação',
    'Demonstrou interesse', 'Necessitou de pausa',
    'Teve resistência', 'Melhorou com adaptação',
    'Precisou de apoio constante',
  ], y, { cols: 2 });
  y += 1;

  // 8. Próximos passos
  y = ensurePage(doc, y, 55);
  y = drawSection(doc, '8. PRÓXIMOS PASSOS', y);
  y = drawCheckboxList(doc, [
    'Manter estratégia',
    'Ajustar atividade',
    'Encaminhar ao AEE',
    'Conversar com família',
    'Registrar nova observação',
  ], y, { cols: 2 });
  y += 4;

  // Assinaturas
  y = ensurePage(doc, y, 45);
  y = drawSignatureArea(doc, ['Professor(a) Regente', 'Coordenação', 'Profissional AEE (se aplicável)'], y);

  drawFooter(doc);
  doc.save('plano-acao-professor-regente-em-branco.pdf');
}
