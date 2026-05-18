// components/ChecklistEnemPDF.tsx
// Gera HTML A4 padronizado ENEM-like para impressão e posterior leitura automática.
// Sem custo de crédito — geração local no browser.

import type { Student, SchoolConfig } from '../types';
import {
  REGENTE_SHEET_SECTIONS,
  CUIDADORA_SHEET_SECTIONS,
  REGENTE_CODE_MAP,
  CUIDADORA_CODE_MAP,
  type SheetSection,
} from '../services/checklistSheetService';

// ─── Helpers ───────────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ─── CSS compartilhado ─────────────────────────────────────────────────────────

const SHARED_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Courier New', Courier, monospace;
    font-size: 10px;
    color: #111;
    padding: 12mm 11mm 12mm 11mm;
    background: #fff;
  }
  .sheet-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    border-bottom: 3px solid #1F4E5F;
    padding-bottom: 8px;
    margin-bottom: 7px;
    gap: 12px;
  }
  .header-left { flex: 1; }
  .sheet-title { font-size: 12px; font-weight: bold; color: #1F4E5F; letter-spacing: 0.4px; }
  .sheet-subtitle { font-size: 9px; color: #444; margin-top: 2px; }
  .form-meta { font-size: 7.5px; color: #888; margin-top: 3px; font-family: monospace; }
  .id-box {
    border: 2px solid #1F4E5F;
    border-radius: 5px;
    padding: 5px 8px;
    text-align: center;
    min-width: 95px;
    flex-shrink: 0;
  }
  .id-label { font-size: 7px; color: #666; text-transform: uppercase; letter-spacing: 0.4px; }
  .id-value { font-size: 11px; font-weight: bold; color: #1F4E5F; font-family: monospace; letter-spacing: 1px; margin-top: 2px; }
  .id-name { font-size: 7.5px; color: #555; margin-top: 2px; }
  .instructions {
    background: #FFF9E6;
    border: 1.5px solid #C69214;
    border-radius: 4px;
    padding: 4px 7px;
    margin-bottom: 6px;
    font-size: 8px;
    line-height: 1.5;
  }
  .instructions strong { color: #92610A; }
  .header-fields {
    display: flex;
    flex-wrap: wrap;
    gap: 5px 10px;
    margin-bottom: 6px;
  }
  .hfield {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 120px;
    flex: 1;
  }
  .hfield-label { font-size: 7px; color: #555; text-transform: uppercase; letter-spacing: 0.3px; font-weight: bold; }
  .hfield-line { border-bottom: 1.5px solid #333; height: 15px; }
  .ctx-row { margin-bottom: 6px; font-size: 8px; }
  .ctx-row .ctx-label { font-size: 7px; font-weight: bold; text-transform: uppercase; color: #333; letter-spacing: 0.3px; display: block; margin-bottom: 3px; }
  .ctx-options { display: flex; flex-wrap: wrap; gap: 3px 8px; }
  .ctx-opt { display: flex; align-items: center; gap: 3px; font-size: 8px; }
  .ctx-opt .bbl { font-size: 13px; line-height: 1; }
  .section {
    border: 1px solid #ccc;
    border-radius: 3px;
    margin-bottom: 4px;
    page-break-inside: avoid;
  }
  .sec-title {
    background: #1F4E5F;
    color: #fff;
    font-size: 8.5px;
    font-weight: bold;
    padding: 2.5px 6px;
    letter-spacing: 0.2px;
  }
  .items-table { width: 100%; border-collapse: collapse; }
  .item-cell { padding: 2px 5px; vertical-align: middle; width: 50%; }
  .bbl { font-size: 14px; line-height: 1; margin-right: 3px; vertical-align: middle; }
  .code { font-family: monospace; font-weight: bold; font-size: 8.5px; color: #1F4E5F; margin-right: 3px; }
  .itext { font-size: 8.5px; color: #222; }
  .obs-section {
    border: 1px solid #ccc;
    border-radius: 3px;
    margin-top: 4px;
    page-break-inside: avoid;
  }
  .obs-title { background: #2E3A59; color: #fff; font-size: 8.5px; font-weight: bold; padding: 2.5px 6px; }
  .obs-lines { padding: 3px 7px; }
  .obs-line { border-bottom: 1px solid #ddd; height: 17px; margin: 1.5px 0; }
  .sheet-footer {
    margin-top: 6px;
    border-top: 1px solid #ddd;
    padding-top: 4px;
    font-size: 7.5px;
    color: #999;
    display: flex;
    justify-content: space-between;
  }
  @media print { body { padding: 10mm; } .section { page-break-inside: avoid; } }
`;

// ─── Builder HTML ──────────────────────────────────────────────────────────────

function buildSheetHtml(opts: {
  title: string;
  subtitle: string;
  formCode: string;
  headerFields: Array<{ label: string; flex?: string }>;
  contextRow?: string;
  sections: SheetSection[];
  codeMap: Record<string, string>;
  student?: Student;
  school?: SchoolConfig | null;
}): string {
  const { title, subtitle, formCode, headerFields, contextRow, sections, codeMap, student, school } = opts;

  const studentCode = student?.id ? student.id.substring(0, 12).toUpperCase() : null;

  const sectionsHtml = sections.map(sec => {
    const rows: string[] = [];
    for (let i = 0; i < sec.codes.length; i += 2) {
      const l = sec.codes[i];
      const r = sec.codes[i + 1];
      rows.push(`<tr>
        <td class="item-cell"><span class="bbl">○</span><span class="code">${esc(l)}</span><span class="itext">${esc(codeMap[l] ?? '')}</span></td>
        ${r
          ? `<td class="item-cell"><span class="bbl">○</span><span class="code">${esc(r)}</span><span class="itext">${esc(codeMap[r] ?? '')}</span></td>`
          : '<td class="item-cell"></td>'
        }
      </tr>`);
    }
    return `<div class="section">
      <div class="sec-title">${esc(sec.emoji)} ${esc(sec.label)}</div>
      <table class="items-table">${rows.join('')}</table>
    </div>`;
  }).join('');

  const headerFieldsHtml = headerFields.map(f =>
    `<div class="hfield" style="${f.flex ? `flex:${f.flex}` : ''}">
      <span class="hfield-label">${esc(f.label)}</span>
      <div class="hfield-line"></div>
    </div>`,
  ).join('');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8"/>
  <title>${esc(title)}</title>
  <style>${SHARED_CSS}</style>
</head>
<body>
  <div class="sheet-header">
    <div class="header-left">
      <div class="sheet-title">IncluiAI — ${esc(title)}</div>
      <div class="sheet-subtitle">${esc(subtitle)}</div>
      ${school?.schoolName ? `<div class="form-meta">Escola: ${esc(school.schoolName)}</div>` : ''}
      <div class="form-meta">Formulário: ${esc(formCode)} · Para leitura automática</div>
    </div>
    <div class="id-box">
      <div class="id-label">${student ? 'Código do aluno' : 'Modelo em branco'}</div>
      <div class="id-value">${student ? esc(studentCode ?? '—') : '____________'}</div>
      ${student ? `<div class="id-name">${esc(student.name.substring(0, 20))}</div>` : ''}
    </div>
  </div>

  <div class="instructions">
    <strong>INSTRUÇÕES:</strong> Marque com <strong>X</strong> ou <strong>●</strong> dentro do círculo ○ ao lado do código.
    Use caneta <strong>azul ou preta</strong>. Evite rasuras. Uma ou mais opções por seção permitidas.
  </div>

  <div class="header-fields">${headerFieldsHtml}</div>

  ${contextRow ?? ''}

  ${sectionsHtml}

  <div class="obs-section">
    <div class="obs-title">OBSERVAÇÕES LIVRES — escreva aqui</div>
    <div class="obs-lines">
      <div class="obs-line"></div>
      <div class="obs-line"></div>
      <div class="obs-line"></div>
      <div class="obs-line"></div>
      <div class="obs-line"></div>
    </div>
  </div>

  <div class="sheet-footer">
    <span>IncluiAI · Uso interno escolar · Não é documento oficial · ${new Date().toLocaleDateString('pt-BR')}</span>
    <span>ENEM-like v1 · Leitura automática habilitada</span>
  </div>
</body>
</html>`;
}

// ─── Abre janela de impressão ──────────────────────────────────────────────────

function openPrint(html: string): void {
  const win = window.open('', '_blank', 'width=920,height=820');
  if (!win) { alert('Permita pop-ups para gerar o checklist.'); return; }
  win.document.write(html);
  win.document.close();
  win.onload = () => win.print();
}

// ─── Exportar PDF Regente ──────────────────────────────────────────────────────

const CONTEXTO_OPTIONS = [
  'Aula expositiva', 'Atividade individual', 'Atividade em grupo',
  'Recreio', 'Entrada/saída', 'Avaliação', 'Atendimento individual', 'Outro',
];

export function printRegenteEnem(student?: Student, school?: SchoolConfig | null): void {
  const contextRow = `<div class="ctx-row">
    <span class="ctx-label">Contexto observado:</span>
    <div class="ctx-options">
      ${CONTEXTO_OPTIONS.map(o => `<span class="ctx-opt"><span class="bbl">○</span> ${esc(o)}</span>`).join('')}
    </div>
  </div>`;

  openPrint(buildSheetHtml({
    title:    'Checklist para Leitura Automática',
    subtitle: 'Observação em Sala — Professor Regente',
    formCode: 'REGENTE-ENEM-v1',
    headerFields: [
      { label: 'Aluno(a)', flex: '2' },
      { label: 'Professor(a) regente', flex: '2' },
      { label: 'Série / Ano', flex: '1' },
      { label: 'Data da observação', flex: '1' },
    ],
    contextRow,
    sections: REGENTE_SHEET_SECTIONS,
    codeMap:  REGENTE_CODE_MAP,
    student,
    school,
  }));
}

// ─── Exportar PDF Cuidadora ────────────────────────────────────────────────────

export function printCuidadoraEnem(student?: Student, school?: SchoolConfig | null): void {
  openPrint(buildSheetHtml({
    title:    'Checklist para Leitura Automática',
    subtitle: 'Análise de Rotina Semanal — Cuidadora',
    formCode: 'CUIDADORA-ENEM-v1',
    headerFields: [
      { label: 'Aluno(a)', flex: '2' },
      { label: 'Cuidadora / Apoio', flex: '2' },
      { label: 'Turno', flex: '1' },
      { label: 'Semana de referência', flex: '1.5' },
      { label: 'Data de preenchimento', flex: '1' },
    ],
    sections: CUIDADORA_SHEET_SECTIONS,
    codeMap:  CUIDADORA_CODE_MAP,
    student,
    school,
  }));
}
