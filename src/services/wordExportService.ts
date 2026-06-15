import PizZip from 'pizzip';
import { DocumentType, type DocumentData, type DocField, type DocSection, type Protocol, type SchoolConfig, type Student, type User } from '../types';

export interface WordExportParams {
  docType: DocumentType;
  title?: string;
  data: DocumentData;
  student: Student;
  user?: User;
  school?: SchoolConfig | null;
  protocol?: Protocol | null;
  auditCode?: string | null;
  generatedAt?: Date;
}

const SUPPORTED_WORD_TYPES = new Set<DocumentType>([
  DocumentType.ESTUDO_CASO,
  DocumentType.PEI,
  DocumentType.PAEE,
  DocumentType.DOCUMENTO_UNIFICADO_PEI_PAEE,
]);

export function isWordExportSupported(docType: DocumentType | string): boolean {
  return SUPPORTED_WORD_TYPES.has(docType as DocumentType) || isUnifiedPeiPaeeType(docType);
}

export function downloadWordDocument(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.docx') ? filename : `${filename}.docx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function exportDocumentToWord(params: WordExportParams): Promise<Blob> {
  if (!isWordExportSupported(params.docType)) {
    throw new Error('Exportacao Word disponivel apenas para Estudo de Caso, PEI, PAEE e Plano Unificado PAEE + PEI.');
  }

  const zip = new PizZip();
  const generatedAt = params.generatedAt ?? new Date();
  const title = getEffectiveDocumentTitle(params.docType, params.title);

  zip.file('[Content_Types].xml', contentTypesXml());
  zip.folder('_rels')?.file('.rels', rootRelsXml());
  zip.folder('docProps')?.file('core.xml', corePropsXml(title, params.user?.name, generatedAt));
  zip.folder('docProps')?.file('app.xml', appPropsXml());
  zip.folder('word')?.file('styles.xml', stylesXml());
  zip.folder('word')?.file('document.xml', documentXml(params, title, generatedAt));
  zip.folder('word')?.folder('_rels')?.file('document.xml.rels', wordDocRelsXml());

  return zip.generate({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    compression: 'DEFLATE',
  });
}

export function buildWordFilename(docType: DocumentType, student: Student, auditCode?: string | null): string {
  const parts = [
    safeFilename(String(docType)),
    safeFilename(student.name || 'aluno'),
    auditCode ? safeFilename(auditCode) : null,
  ].filter(Boolean);
  return `${parts.join('_')}.docx`;
}

function documentXml(params: WordExportParams, title: string, generatedAt: Date): string {
  const body: string[] = [];
  const auditCode = params.auditCode || params.protocol?.auditCode || '';
  const schoolName = params.school?.schoolName || params.student.schoolName || params.student.externalSchoolName || '';

  body.push(paragraph(schoolName || 'IncluiAI', { style: 'Subtitle', align: 'center' }));
  body.push(paragraph(title, { style: 'Title', align: 'center' }));
  body.push(paragraph(`Aluno(a): ${valueOrEmpty(params.student.name)}`, { bold: true }));
  body.push(paragraph(`Serie/Turma: ${joinNonEmpty([params.student.grade, params.student.shift], ' - ') || 'Nao informado'}`));
  body.push(paragraph(`Escola: ${schoolName || 'Nao informado'}`));
  body.push(paragraph(`Data: ${formatDate(generatedAt)}`));
  if (auditCode) body.push(paragraph(`Codigo: ${auditCode}`));
  body.push(paragraph(''));

  for (const section of normalizeSections(params.data)) {
    body.push(sectionXml(section));
  }

  body.push(signaturesXml(params));
  body.push(sectionPropertiesXml());

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>${body.join('')}</w:body>
</w:document>`;
}

function sectionXml(section: DocSection): string {
  const chunks: string[] = [];
  chunks.push(paragraph(section.title || 'Secao', { style: 'Heading1' }));

  for (const field of section.fields ?? []) {
    chunks.push(fieldXml(field));
  }

  return chunks.join('');
}

function isHtml(str: string): boolean {
  return /<[a-z][\s\S]*>/i.test(str);
}

function normalizeMarkdownText(text: string): string {
  return String(text ?? '')
    .replace(/^\s*[-*]\s+/gm, '• ')
    .replace(/\*\*([^*\n]*[A-Za-zÀ-ÿ][^*\n]*)\*\*/g, '$1')
    .replace(/__([^_\n]*[A-Za-zÀ-ÿ][^\n_]*)__/g, '$1')
    .replace(/(^|[\s([{"'“])\*([^*\n]*[A-Za-zÀ-ÿ][^*\n]*)\*(?=$|[\s)\].,;:!?"'”}])/g, '$1$2')
    .replace(/(^|[\s([{"'“])_([^_\n]*[A-Za-zÀ-ÿ][^_\n]*)_(?=$|[\s)\].,;:!?"'”}])/g, '$1$2')
    .replace(/\*\*+/g, '')
    .replace(/__+/g, '');
}

function convertInlineMarkdown(text: string): string {
  return escapeXml(text)
    .replace(/\*\*([^*\n]*[A-Za-zÀ-ÿ][^*\n]*)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_\n]*[A-Za-zÀ-ÿ][^\n_]*)__/g, '<strong>$1</strong>')
    .replace(/(^|[\s([{"'“])\*([^*\n]*[A-Za-zÀ-ÿ][^*\n]*)\*(?=$|[\s)\].,;:!?"'”}])/g, '$1<em>$2</em>')
    .replace(/(^|[\s([{"'“])_([^_\n]*[A-Za-zÀ-ÿ][^_\n]*)_(?=$|[\s)\].,;:!?"'”}])/g, '$1<em>$2</em>');
}

function normalizeMarkdownToHtml(input: string): string {
  if (!input) return '';
  if (isHtml(input)) {
    const doc = new DOMParser().parseFromString(input, 'text/html');
    const walker = document.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    while (walker.nextNode()) nodes.push(walker.currentNode as Text);
    for (const node of nodes) {
      const value = node.textContent ?? '';
      if (!/(\*\*|__|(^|[\s([{"'“])[*_][^*_]+[*_])/m.test(value)) continue;
      const template = document.createElement('template');
      template.innerHTML = convertInlineMarkdown(value);
      node.replaceWith(template.content);
    }
    return doc.body.innerHTML;
  }

  const lines = input.replace(/\r\n?/g, '\n').split('\n');
  const parts: string[] = [];
  let list: string[] = [];
  const flushList = () => {
    if (!list.length) return;
    parts.push(`<ul>${list.map(item => `<li>${convertInlineMarkdown(item)}</li>`).join('')}</ul>`);
    list = [];
  };
  for (const line of lines) {
    const item = line.match(/^\s*[-*]\s+(.+)$/);
    if (item) {
      list.push(item[1]);
      continue;
    }
    flushList();
    parts.push(convertInlineMarkdown(line));
  }
  flushList();
  return parts.join('<br>');
}

function splitAeeNames(value: unknown): string[] {
  return normalizeMarkdownText(joinValue(value))
    .split(/[;,\n|]+/)
    .map(name => name.replace(/^(prof(?:essor)?(?:a)?\.?|profissional(?:\s+do)?|aee)\s*:?\s*/i, '').trim())
    .filter(Boolean)
    .filter((name, index, arr) => arr.findIndex(other => other.toLowerCase() === name.toLowerCase()) === index);
}

function htmlToOoxmlParagraphs(html: string): string[] {
  const doc = new DOMParser().parseFromString(normalizeMarkdownToHtml(html), 'text/html');
  const result: string[] = [];

  function rpr(bold?: boolean, italic?: boolean, underline?: boolean, sz?: number): string {
    const size = sz ?? 24;
    return `<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/>${bold ? '<w:b/>' : ''}${italic ? '<w:i/>' : ''}${underline ? '<w:u w:val="single"/>' : ''}</w:rPr>`;
  }

  function ppr(align?: string, spacingAfter?: number): string {
    const jc = align && align !== 'left' ? `<w:jc w:val="${align === 'justify' ? 'both' : align}"/>` : '';
    return `<w:pPr>${jc}<w:spacing w:after="${spacingAfter ?? 120}" w:line="276" w:lineRule="auto"/></w:pPr>`;
  }

  function alignFromStyle(el: Element): string {
    const m = (el.getAttribute('style') ?? '').match(/text-align\s*:\s*(center|right|justify)/i);
    return m ? m[1] : 'left';
  }

  function walkInline(node: Node, bold: boolean, italic: boolean, underline: boolean): string {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = node.textContent ?? '';
      return t ? `<w:r>${rpr(bold, italic, underline)}<w:t xml:space="preserve">${escapeXml(t)}</w:t></w:r>` : '';
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    if (tag === 'br') return `<w:r><w:br/></w:r>`;
    const b = bold || tag === 'strong' || tag === 'b';
    const it = italic || tag === 'em' || tag === 'i';
    const u = underline || tag === 'u';
    return Array.from(el.childNodes).map(c => walkInline(c, b, it, u)).join('');
  }

  function processNode(node: Node): void {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = (node.textContent ?? '').trim();
      if (t) result.push(`<w:p>${ppr()}<w:r>${rpr()}<w:t xml:space="preserve">${escapeXml(t)}</w:t></w:r></w:p>`);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    const align = alignFromStyle(el);

    if (tag === 'h1') {
      const runs = Array.from(el.childNodes).map(c => walkInline(c, true, false, false)).join('');
      result.push(`<w:p><w:pPr><w:pStyle w:val="Heading1"/><w:spacing w:after="180" w:line="276" w:lineRule="auto"/></w:pPr>${runs || `<w:r>${rpr(true, false, false, 26)}<w:t/></w:r>`}</w:p>`);
    } else if (tag === 'h2') {
      const runs = Array.from(el.childNodes).map(c => walkInline(c, true, false, false)).join('');
      result.push(`<w:p><w:pPr><w:pStyle w:val="Heading2"/><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr>${runs || `<w:r>${rpr(true, false, false, 23)}<w:t/></w:r>`}</w:p>`);
    } else if (tag === 'ul') {
      for (const li of Array.from(el.children)) {
        if (li.tagName.toLowerCase() !== 'li') continue;
        const runs = Array.from(li.childNodes).map(c => walkInline(c, false, false, false)).join('');
        result.push(`<w:p>${ppr('left', 60)}<w:r>${rpr()}<w:t xml:space="preserve">• </w:t></w:r>${runs}</w:p>`);
      }
    } else if (tag === 'ol') {
      let n = 1;
      for (const li of Array.from(el.children)) {
        if (li.tagName.toLowerCase() !== 'li') continue;
        const runs = Array.from(li.childNodes).map(c => walkInline(c, false, false, false)).join('');
        result.push(`<w:p>${ppr('left', 60)}<w:r>${rpr()}<w:t xml:space="preserve">${n++}. </w:t></w:r>${runs}</w:p>`);
      }
    } else if (tag === 'p' || tag === 'div') {
      const runs = Array.from(el.childNodes).map(c => walkInline(c, false, false, false)).join('');
      if (runs.trim()) result.push(`<w:p>${ppr(align)}<w:r>${rpr()}<w:t/></w:r>${runs}</w:p>`);
      else {
        // empty block → check children for nested blocks
        for (const child of Array.from(el.childNodes)) processNode(child);
      }
    } else if (tag === 'br') {
      result.push(`<w:p>${ppr('left', 60)}</w:p>`);
    } else {
      // inline tag at block level → wrap in paragraph
      const runs = walkInline(el, false, false, false);
      if (runs.trim()) result.push(`<w:p>${ppr()}<w:r>${rpr()}<w:t/></w:r>${runs}</w:p>`);
    }
  }

  for (const child of Array.from(doc.body.childNodes)) {
    processNode(child);
  }

  return result;
}

function fieldXml(field: DocField): string {
  const chunks: string[] = [];
  const label = field.label || field.id || 'Campo';
  const raw = normalizeMarkdownToHtml(String(field.value ?? ''));

  chunks.push(paragraph(label, { style: 'Heading2' }));

  if (isHtml(raw)) {
    const paras = htmlToOoxmlParagraphs(raw);
    if (paras.length === 0) {
      chunks.push(paragraph('Nao informado', { color: '666666' }));
    } else {
      chunks.push(...paras);
    }
  } else {
    const lines = formatFieldValue(field.value, field);
    if (lines.length === 0) {
      chunks.push(paragraph('Nao informado', { color: '666666' }));
    } else {
      for (const line of lines) {
        chunks.push(paragraph(line, { preserveBreaks: true }));
      }
    }
  }

  return chunks.join('');
}

function signaturesXml(params: WordExportParams): string {
  const aeeNames = splitAeeNames(params.student.aeeTeacher || params.school?.aeeRepresentative || params.school?.aeeRepName);
  const roles = [
    ['Professor(a) responsavel', params.user?.name || params.student.regentTeacher],
    ...aeeNames.map(name => ['Professor(a) AEE', name]),
    ['Coordenacao/Direcao', params.student.coordinator || params.school?.coordinatorName || params.school?.managerName],
  ].filter(([_, name]) => Boolean(String(name ?? '').trim()));

  const chunks = [paragraph('Assinaturas', { style: 'Heading1' })];
  const entries = roles.length ? roles : [['Responsavel pelo documento', '']];

  for (const [role, name] of entries) {
    chunks.push(paragraph(''));
    chunks.push(paragraph('____________________________________________', { align: 'center' }));
    chunks.push(paragraph(name ? String(name) : String(role ?? ''), { align: 'center', bold: Boolean(name) }));
    if (name) chunks.push(paragraph(String(role ?? ''), { align: 'center', color: '666666' }));
  }

  return chunks.join('');
}

function paragraph(text: string, options: {
  style?: 'Title' | 'Subtitle' | 'Heading1' | 'Heading2';
  align?: 'left' | 'center' | 'right';
  bold?: boolean;
  color?: string;
  preserveBreaks?: boolean;
} = {}): string {
  const size = options.style === 'Title' ? 32 : options.style === 'Heading1' ? 26 : options.style === 'Heading2' ? 23 : 24;
  const spacingAfter = options.style === 'Title' ? 240 : options.style === 'Heading1' ? 180 : 120;
  const pStyle = options.style ? `<w:pStyle w:val="${options.style}"/>` : '';
  const align = options.align && options.align !== 'left' ? `<w:jc w:val="${options.align}"/>` : '';
  const lines = options.preserveBreaks ? normalizeMarkdownText(String(text ?? '')).split(/\r?\n/) : [normalizeMarkdownText(String(text ?? ''))];
  const runText = lines.map((line, index) => `${index > 0 ? '<w:br/>' : ''}<w:t xml:space="preserve">${escapeXml(line)}</w:t>`).join('');

  return `<w:p>
    <w:pPr>${pStyle}${align}<w:spacing w:after="${spacingAfter}" w:line="276" w:lineRule="auto"/></w:pPr>
    <w:r>
      <w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/>${options.bold ? '<w:b/>' : ''}${options.color ? `<w:color w:val="${options.color}"/>` : ''}</w:rPr>
      ${runText}
    </w:r>
  </w:p>`;
}

function formatFieldValue(value: unknown, field?: DocField): string[] {
  if (value === null || value === undefined || value === '') return [];

  if (field?.type === 'scale') {
    const max = field.maxScale ?? 5;
    return [`${value} / ${max}`];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      const text = joinValue(item);
      return text ? [`- ${text}`] : [];
    });
  }

  if (typeof value === 'object') {
    return objectToLines(value as Record<string, unknown>);
  }

  const text = normalizeMarkdownText(String(value)).trim();
  return text ? text.split(/\r?\n/).filter(line => line.trim()) : [];
}

function objectToLines(obj: Record<string, unknown>, prefix = ''): string[] {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined || value === '') continue;
    const label = prettifyKey(key);
    if (Array.isArray(value)) {
      const joined = value.map(joinValue).filter(Boolean).join('; ');
      if (joined) lines.push(`${prefix}${label}: ${joined}`);
    } else if (typeof value === 'object') {
      lines.push(...objectToLines(value as Record<string, unknown>, `${prefix}${label} - `));
    } else {
      lines.push(`${prefix}${label}: ${normalizeMarkdownText(String(value))}`);
    }
  }
  return lines;
}

function joinValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.map(joinValue).filter(Boolean).join(', ');
  if (typeof value === 'object') return objectToLines(value as Record<string, unknown>).join('; ');
  return normalizeMarkdownText(String(value)).trim();
}

function joinNonEmpty(values: Array<string | undefined | null>, separator: string): string {
  return values.map(v => String(v ?? '').trim()).filter(Boolean).join(separator);
}

function valueOrEmpty(value: unknown): string {
  return joinValue(value) || 'Nao informado';
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('pt-BR');
}

function getDocumentTitle(docType: DocumentType): string {
  if (docType === DocumentType.PEI) return 'Plano Educacional Individualizado (PEI)';
  if (docType === DocumentType.PAEE) return 'Plano de Atendimento Educacional Especializado (PAEE)';
  if (isUnifiedPeiPaeeType(docType)) return 'Plano Unificado PAEE + PEI';
  return 'Estudo de Caso';
}

function getEffectiveDocumentTitle(docType: DocumentType | string, title?: string): string {
  if (isUnifiedPeiPaeeType(docType) && (!title || isUnifiedPeiPaeeType(title))) {
    return 'Plano Unificado PAEE + PEI';
  }
  return title || getDocumentTitle(docType as DocumentType);
}

function isUnifiedPeiPaeeType(value: unknown): boolean {
  const normalized = String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  return normalized === 'DOCUMENTO_UNIFICADO_PEI_PAEE'
    || (normalized.includes('UNIFICADO') && normalized.includes('PEI') && normalized.includes('PAEE'));
}

function normalizeSections(data: DocumentData | unknown): DocSection[] {
  const source = data as any;
  const direct = coerceSections(source?.sections);
  if (direct.length) return direct;

  const structured = coerceSections(source?.structuredData?.sections);
  if (structured.length) return structured;

  const content = source?.content;
  if (typeof content === 'string' && content.trim()) {
    try {
      const parsed = JSON.parse(content);
      const parsedSections = normalizeSections(parsed);
      if (parsedSections.length) return parsedSections;
    } catch {
      return legacyTextSection(content);
    }
  }

  const legacyValue = source?.value ?? source?.text ?? source?.body;
  return legacyValue ? legacyTextSection(joinValue(legacyValue)) : [];
}

function coerceSections(sections: unknown): DocSection[] {
  if (!Array.isArray(sections)) return [];

  return sections
    .map((section, sectionIndex) => {
      const raw = section as any;
      const fields = coerceFields(raw?.fields);
      if (!fields.length && (raw?.value ?? raw?.content ?? raw?.text)) {
        fields.push({
          id: `${raw?.id || `sec_${sectionIndex + 1}`}_conteudo`,
          label: raw?.label || raw?.title || 'Conteudo',
          type: 'textarea',
          value: raw.value ?? raw.content ?? raw.text,
        });
      }

      return {
        id: String(raw?.id || `sec_${sectionIndex + 1}`),
        title: String(raw?.title || raw?.label || `Secao ${sectionIndex + 1}`),
        fields,
      };
    })
    .filter(section => section.fields.length > 0);
}

function coerceFields(fields: unknown): DocField[] {
  if (!Array.isArray(fields)) return [];

  return fields.map((field, fieldIndex) => {
    const raw = field as any;
    return {
      id: String(raw?.id || `field_${fieldIndex + 1}`),
      label: String(raw?.label || raw?.title || raw?.id || `Campo ${fieldIndex + 1}`),
      type: raw?.type || 'textarea',
      value: raw?.value ?? raw?.content ?? raw?.text ?? '',
      options: raw?.options,
      placeholder: raw?.placeholder,
      columns: raw?.columns,
      isCustom: raw?.isCustom,
      allowAudio: raw?.allowAudio,
      audioUrl: raw?.audioUrl,
      audioDuration: raw?.audioDuration,
      audioCreatedAt: raw?.audioCreatedAt,
      required: raw?.required,
      description: raw?.description,
      minScale: raw?.minScale,
      maxScale: raw?.maxScale,
    } as DocField;
  });
}

function legacyTextSection(text: string): DocSection[] {
  const value = String(text ?? '').trim();
  if (!value) return [];
  return [{
    id: 'legacy_content',
    title: 'Conteudo',
    fields: [{
      id: 'legacy_text',
      label: 'Conteudo',
      type: 'textarea',
      value,
    }],
  }];
}

function prettifyKey(key: string): string {
  return key
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim()
    .replace(/^./, char => char.toUpperCase());
}

function safeFilename(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function sectionPropertiesXml(): string {
  return `<w:sectPr>
    <w:pgSz w:w="11906" w:h="16838"/>
    <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/>
  </w:sectPr>`;
}

function contentTypesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;
}

function rootRelsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;
}

function wordDocRelsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
}

function corePropsXml(title: string, author: string | undefined, generatedAt: Date): string {
  const iso = generatedAt.toISOString();
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${escapeXml(title)}</dc:title>
  <dc:creator>${escapeXml(author || 'IncluiAI')}</dc:creator>
  <cp:lastModifiedBy>${escapeXml(author || 'IncluiAI')}</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${iso}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${iso}</dcterms:modified>
</cp:coreProperties>`;
}

function appPropsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>IncluiAI</Application>
</Properties>`;
}

function stylesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:rPrDefault>
    <w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
  <w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:qFormat/><w:rPr><w:b/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:qFormat/><w:rPr><w:color w:val="666666"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:qFormat/><w:rPr><w:b/><w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:qFormat/><w:rPr><w:b/><w:sz w:val="23"/><w:szCs w:val="23"/></w:rPr></w:style>
</w:styles>`;
}
