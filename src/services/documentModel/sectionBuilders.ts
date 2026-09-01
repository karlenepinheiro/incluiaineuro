// services/documentModel/sectionBuilders.ts
// ─────────────────────────────────────────────────────────────────────────────
// [FASE 2] Blocos de construção puros para montar `DocSection[]` a partir dos
// dados atuais de qualquer documento formal que NÃO passa pelo DocumentBuilder.
//
// Os adaptadores por documento (relatorioTecnico.ts, ficha.ts, quickDoc.ts,
// relatorioEvolucao.ts) usam SOMENTE estes helpers, garantindo:
//   - ordem de seções idêntica à do PDF canônico daquele documento;
//   - "Não informado" para campos vazios (regra existente do projeto);
//   - prosa multi-parágrafo vira parágrafos Word de verdade;
//   - listas viram itens de verdade;
//   - nenhuma dependência de DOM/IA — 100% testável em `node`.

import type { DocField, DocSection } from '../../types';

/** Marca um campo como "bloco de texto corrido" (sem subtítulo próprio). */
const PROSE_LABEL = '';

export const NAO_INFORMADO = 'Não informado';

function slug(s: string): string {
  return (
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 48) || 'sec'
  );
}

export function cleanText(value: unknown): string {
  return String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

/** Divide prosa em parágrafos (quebra dupla) e colapsa quebras simples em espaço. */
export function toParagraphs(value: unknown): string[] {
  const text = cleanText(value);
  if (!text) return [];
  return text
    .split(/\n{2,}/)
    .map(p => p.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean);
}

export function isBlank(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (Array.isArray(value)) return value.filter(v => !isBlank(v)).length === 0;
  return cleanText(value) === '';
}

let _fieldSeq = 0;
function fieldId(sectionId: string): string {
  _fieldSeq += 1;
  return `${sectionId}_f${_fieldSeq}`;
}

// ─── Campos ──────────────────────────────────────────────────────────────────

/**
 * Campo de texto corrido (um ou mais parágrafos).
 * - padrão: vazio → "Não informado" (regra do projeto);
 * - `{ optional: true }`: vazio → [] (a seção some, igual ao PDF que só
 *   renderiza o bloco quando há conteúdo).
 */
export function proseField(
  sectionId: string,
  label: string,
  value: unknown,
  opts: { optional?: boolean } = {},
): DocField[] {
  const paras = toParagraphs(value);
  if (paras.length === 0) {
    if (opts.optional) return [];
    return [{ id: fieldId(sectionId), label: label || PROSE_LABEL, type: 'textarea', value: NAO_INFORMADO }];
  }
  return paras.map((p, i) => ({
    id: fieldId(sectionId),
    // O primeiro parágrafo carrega o rótulo (quando houver); os demais são
    // continuação de texto corrido, sem subtítulo repetido.
    label: i === 0 ? (label || PROSE_LABEL) : PROSE_LABEL,
    type: 'textarea' as const,
    value: p,
  }));
}

/** Campo de lista (itens de verdade). Vazio → omite o campo (retorna []). */
export function listField(sectionId: string, label: string, items: Array<string | null | undefined> | undefined): DocField[] {
  const clean = (items ?? []).map(i => cleanText(i)).filter(Boolean);
  if (clean.length === 0) return [];
  return [{ id: fieldId(sectionId), label: label || PROSE_LABEL, type: 'checklist', value: clean }];
}

/**
 * Campo tabular de verdade (vira `<w:tbl>` no Word). `rows[0]` é o cabeçalho.
 * Retorna [] quando não há linhas de dados.
 */
export function gridField(sectionId: string, label: string, header: string[], rows: Array<Array<string | number | null | undefined>>): DocField[] {
  const dataRows = rows.filter(r => r.some(c => cleanText(c) !== ''));
  if (dataRows.length === 0) return [];
  const grid = [header, ...dataRows.map(r => r.map(c => cleanText(c) || '—'))];
  return [{ id: fieldId(sectionId), label: label || PROSE_LABEL, type: 'grid', value: grid, columns: header }];
}

/** Par rótulo→valor curto (identificação, datas, códigos). Vazio → "Não informado". */
export function kvField(sectionId: string, label: string, value: unknown): DocField {
  const v = cleanText(value);
  return { id: fieldId(sectionId), label, type: 'text', value: v || NAO_INFORMADO };
}

/** Campo de escala 1..max com observação opcional. */
export function scaleField(sectionId: string, label: string, rating: number | string | null | undefined, max = 5, observation?: string): DocField[] {
  const n = Number.parseInt(String(rating ?? ''), 10);
  const out: DocField[] = [];
  if (Number.isFinite(n) && n > 0) {
    out.push({ id: fieldId(sectionId), label, type: 'scale', value: n, maxScale: max });
  } else {
    out.push({ id: fieldId(sectionId), label, type: 'text', value: NAO_INFORMADO });
  }
  const obs = cleanText(observation);
  if (obs) out.push({ id: fieldId(sectionId), label: 'Observação', type: 'textarea', value: obs });
  return out;
}

// ─── Seções ──────────────────────────────────────────────────────────────────

export interface SectionSpec {
  title: string;
  fields: DocField[];
  /** Quando true, a seção é mantida mesmo sem campos (raro). */
  keepEmpty?: boolean;
}

/** Monta uma seção; retorna null quando não há nada a mostrar (para `.filter(Boolean)`). */
export function section(title: string, fields: Array<DocField | DocField[]>): DocSection | null {
  const flat = fields.flat().filter(Boolean) as DocField[];
  if (flat.length === 0) return null;
  return { id: slug(title), title, fields: flat };
}

/**
 * Junta as seções não-nulas em `DocSection[]` pronto para o renderer Word.
 * Aceita `false`/`0`/`null`/`undefined` (resultado de `cond && section(...)`).
 */
export function buildSections(secs: Array<DocSection | null | undefined | false | 0 | ''>): DocSection[] {
  return secs.filter((s): s is DocSection => !!s && typeof s === 'object' && Array.isArray(s.fields) && s.fields.length > 0);
}

/** Reinicia o contador de ids de campo — chamar no início de cada adaptador. */
export function resetFieldSeq(): void {
  _fieldSeq = 0;
}
