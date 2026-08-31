import PizZip from 'pizzip';
import {
  DocumentType,
  type ActivityAnswerKeyItem,
  type ActivityExercise,
  type ActivityPackage,
  type ActivitySchema,
  type DocumentData,
  type DocField,
  type DocSection,
  type GuiaPedagogico,
  type Protocol,
  type SchoolConfig,
  type Student,
  type User,
} from '../types';

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
  DocumentType.PDI,
  DocumentType.DOCUMENTO_UNIFICADO_PEI_PAEE,
]);

export function isWordExportSupported(docType: DocumentType | string): boolean {
  return SUPPORTED_WORD_TYPES.has(docType as DocumentType) || isUnifiedPeiPaeeType(docType);
}

export function downloadWordDocument(blob: Blob, filename: string): void {
  if (!(blob instanceof Blob) || blob.size === 0) {
    throw new Error('DOCX vazio ou invalido.');
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = safeDocxFilename(filename);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Monta o pacote OOXML (.docx) a partir de um `WordExportParams` já resolvido e
 * de um título efetivo. Núcleo compartilhado por `exportDocumentToWord` (tipos
 * formais do DocumentBuilder) e por `exportGenericDocumentToWord` (Fase 2 —
 * Relatório Técnico, Fichas, QuickDoc, Relatório de Evolução, etc.). Um único
 * ponto de montagem de zip/estilos/relacionamentos — nada duplicado.
 */
function buildWordDocxBlob(params: WordExportParams, title: string, generatedAt: Date): Blob {
  const zip = new PizZip();

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

export async function exportDocumentToWord(params: WordExportParams): Promise<Blob> {
  if (!isWordExportSupported(params.docType)) {
    throw new Error('Exportacao Word disponivel apenas para Estudo de Caso, PEI, PAEE, PDI e Plano Unificado PAEE + PEI.');
  }
  const generatedAt = params.generatedAt ?? new Date();
  const title = getEffectiveDocumentTitle(params.docType, params.title);
  return buildWordDocxBlob(params, title, generatedAt);
}

export interface GenericWordExportParams {
  /** Título do documento (ex.: "Relatório Técnico", "Escuta da Família"). */
  title: string;
  /** Seções canônicas já montadas pelo adaptador do documento (ver src/services/documentModel). */
  data: DocumentData;
  student: Student;
  user?: User;
  school?: SchoolConfig | null;
  auditCode?: string | null;
  generatedAt?: Date;
}

/**
 * [FASE 2] Gera um `.docx` real (mesmo renderer OOXML canônico — cabeçalho
 * institucional, títulos hierarquizados, tabelas, listas, "Não informado",
 * assinaturas, rodapé) para documentos formais que NÃO passam pelo
 * DocumentBuilder e não têm um `DocumentType` próprio: Relatório Técnico,
 * Relatório de Evolução, Fichas Complementares, QuickDoc, etc.
 *
 * O chamador é responsável por converter os dados atuais do documento em
 * `data.sections` (DocSection[]) via um adaptador dedicado — este serviço não
 * conhece a estrutura de nenhum documento específico e NUNCA chama IA.
 * É este mesmo Blob que o botão "Abrir no Google Docs" envia ao Drive.
 */
export async function exportGenericDocumentToWord(params: GenericWordExportParams): Promise<Blob> {
  const generatedAt = params.generatedAt ?? new Date();
  const title = (params.title || 'Documento IncluiAI').trim();
  const wordParams: WordExportParams = {
    // `documentXml`/`signaturesXml` não ramificam por `docType`; passamos um
    // valor só para satisfazer o tipo. O título vem sempre de `params.title`.
    docType: DocumentType.ESTUDO_CASO,
    title,
    data: params.data,
    student: params.student,
    user: params.user,
    school: params.school ?? null,
    auditCode: params.auditCode ?? null,
    generatedAt,
  };
  return buildWordDocxBlob(wordParams, title, generatedAt);
}

/** Nome de arquivo seguro para download `.docx` de um documento genérico da Fase 2. */
export function buildGenericWordFilename(docLabel: string, student: Student, auditCode?: string | null): string {
  const parts = [
    safeFilename(docLabel || 'documento'),
    safeFilename(student.name || 'aluno'),
    auditCode ? safeFilename(auditCode) : null,
  ].filter(Boolean);
  return `${parts.join('_')}.docx`;
}

export async function exportIncluiLabActivityToWord(pkg: ActivityPackage, opts: {
  studentName?: string;
  user?: User;
  generatedAt?: Date;
} = {}): Promise<Blob> {
  const zip = new PizZip();
  const generatedAt = opts.generatedAt ?? new Date();
  const title = pkg.activity.header.title || 'Atividade IncluiLAB';

  zip.file('[Content_Types].xml', contentTypesXml());
  zip.folder('_rels')?.file('.rels', rootRelsXml());
  zip.folder('docProps')?.file('core.xml', corePropsXml(title, opts.user?.name, generatedAt));
  zip.folder('docProps')?.file('app.xml', appPropsXml());
  zip.folder('word')?.file('styles.xml', stylesXml());
  zip.folder('word')?.file('document.xml', incluilabActivityDocumentXml(pkg, opts, generatedAt));
  zip.folder('word')?.folder('_rels')?.file('document.xml.rels', wordDocRelsXml());

  return zip.generate({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    compression: 'DEFLATE',
  });
}

export function buildIncluiLabWordFilename(pkg: ActivityPackage): string {
  const prefix = pkg.activity.requestType === 'avaliacao'
    ? 'avaliacao'
    : pkg.activity.requestType === 'adaptacao'
      ? 'atividade_adaptada'
      : 'atividade';
  return `${safeFilename(`${prefix}_${pkg.activity.header.title || 'incluilab'}`) || prefix}.docx`;
}

export function buildWordFilename(docType: DocumentType, student: Student, auditCode?: string | null): string {
  const parts = [
    safeFilename(String(docType)),
    safeFilename(student.name || 'aluno'),
    auditCode ? safeFilename(auditCode) : null,
  ].filter(Boolean);
  return `${parts.join('_')}.docx`;
}

function incluilabActivityDocumentXml(pkg: ActivityPackage, opts: {
  studentName?: string;
  user?: User;
}, generatedAt: Date): string {
  const body: string[] = [];
  body.push(...studentSheetXml(pkg.activity, opts.studentName, generatedAt));

  if (pkg.activity.requestType === 'avaliacao' && (pkg.answerKey?.length || pkg.activity.answerKey?.length)) {
    body.push(pageBreakXml());
    body.push(...answerKeyXml(pkg.activity, pkg.answerKey ?? pkg.activity.answerKey ?? []));
  }

  if (pkg.activity.requestType === 'adaptacao' && pkg.teacherGuide) {
    body.push(pageBreakXml());
    body.push(...teacherGuideXml(pkg.teacherGuide, pkg.activity.header.title));
  }

  body.push(sectionPropertiesXml());
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>${body.join('')}</w:body>
</w:document>`;
}

function studentSheetXml(activity: ActivitySchema, studentName: string | undefined, generatedAt: Date): string[] {
  const body: string[] = [];
  body.push(paragraph('IncluiLAB', { style: 'Subtitle', align: 'center' }));
  body.push(paragraph(activity.header.title, { style: 'Title', align: 'center' }));
  body.push(paragraph(joinNonEmpty([
    activity.header.theme,
    activity.header.level,
    activity.header.estimatedTime,
  ], ' | '), { align: 'center', color: '666666' }));
  body.push(paragraph(`Nome: ${studentName?.trim() || '________________________________'}    Data: ${formatDate(generatedAt)}    Turma: ________________`, { bold: true }));
  if (activity.header.objective) body.push(paragraph(`Objetivo: ${activity.header.objective}`));
  if (activity.header.instructions.length) {
    body.push(paragraph('Instruções', { style: 'Heading1' }));
    for (const instruction of activity.header.instructions) body.push(paragraph(`• ${instruction}`));
  }

  for (const block of segmentStudentBlocks(activity.blocks)) {
    if (!block.content && !block.items.length) continue;
    if (block.type === 'teacher_note' || block.type === 'accessibility') continue;
    body.push(paragraph(block.title || 'Texto', { style: 'Heading1' }));
    if (block.content) body.push(...textParagraphs(block.content));
    for (const item of block.items) body.push(paragraph(`• ${item}`));
  }

  const segments = segmentExercisesForStudent(activity.exercises);
  body.push(paragraph(segments.length > 1 ? 'Parte 1' : 'Questões', { style: 'Heading1' }));
  if (segments.length > 1) body.push(paragraph('Resolva os itens 1 a 5. Depois faça uma pausa curta antes da Parte 2.', { color: '666666' }));
  activity.exercises.forEach((exercise, index) => {
    if (index === 5 && segments.length > 1) {
      body.push(paragraph('Pausa curta', { style: 'Heading2' }));
      body.push(paragraph('Respire, confira a primeira parte e continue quando estiver pronto.', { color: '666666' }));
      body.push(paragraph('Parte 2', { style: 'Heading1' }));
      body.push(paragraph('Resolva os itens 6 a 10 mantendo a mesma estratégia.', { color: '666666' }));
    }
    body.push(...exerciseXml(exercise, index));
  });
  return body;
}

function exerciseXml(exercise: ActivityExercise, index: number): string[] {
  const body: string[] = [];
  body.push(paragraph(`${index + 1}. ${exercise.title || labelForIncluiLabExercise(exercise.type)}`, { style: 'Heading2' }));
  body.push(paragraph(exercise.prompt));

  if (exercise.type === 'multiple_choice' && exercise.options.length) {
    exercise.options.forEach((option, optionIndex) => {
      body.push(paragraph(`${String.fromCharCode(65 + optionIndex)}) ${option}`));
    });
    return body;
  }

  if (exercise.type === 'word_search') {
    body.push(gridTableXml(normalizeGridRowsForWord(exercise.grid, exercise.options)));
    if (exercise.options.length) body.push(paragraph(`Banco de palavras: ${exercise.options.join(', ')}`));
    return body;
  }

  if (exercise.type === 'crossword') {
    body.push(gridTableXml(normalizeGridRowsForWord(exercise.grid, exercise.options)));
    const clues = exercise.clues?.length ? exercise.clues : exercise.options;
    clues.slice(0, 12).forEach((clue, clueIndex) => body.push(paragraph(`${clueIndex + 1}. ${clue}`)));
    return body;
  }

  if (exercise.type === 'matching') {
    const rows = (exercise.options.length ? exercise.options : ['Item 1', 'Item 2', 'Item 3']).slice(0, 12);
    body.push(simpleTableXml(rows.map((item, rowIndex) => [`${rowIndex + 1}. ${item}`, '____________________________'])));
    return body;
  }

  if (exercise.type === 'table') {
    const rows = (exercise.options.length ? exercise.options : ['Linha 1', 'Linha 2', 'Linha 3']).slice(0, 12);
    body.push(simpleTableXml(rows.map(item => [item, ''])));
    return body;
  }

  if (exercise.type === 'coloring' || exercise.type === 'drawing') {
    body.push(simpleTableXml([['Espaço para desenhar/colorir']], 4200));
    return body;
  }

  if (exercise.options.length && (exercise.type === 'fill_blank' || exercise.type === 'ordering')) {
    exercise.options.forEach((option, optionIndex) => body.push(paragraph(`${optionIndex + 1}. ${option}`)));
  }

  const lines = Math.min(Math.max(exercise.answerLines || 3, 2), 8);
  for (let i = 0; i < lines; i++) body.push(paragraph('____________________________________________________________'));
  return body;
}

function answerKeyXml(activity: ActivitySchema, answerKey: ActivityAnswerKeyItem[]): string[] {
  const body = [paragraph('Gabarito', { style: 'Title', align: 'center' })];
  const exerciseTitleById = new Map(activity.exercises.map((exercise, index) => [exercise.id, `${index + 1}. ${exercise.title || exercise.prompt}`]));
  answerKey.forEach((item) => {
    body.push(paragraph(exerciseTitleById.get(item.exerciseId) || item.exerciseId, { style: 'Heading2' }));
    body.push(paragraph(`Resposta: ${item.answer}`));
    if (item.explanation) body.push(paragraph(`Explicação: ${item.explanation}`));
  });
  return body;
}

function teacherGuideXml(guide: GuiaPedagogico, activityTitle: string): string[] {
  const compact = compactTeacherGuide(guide);
  const body = [
    paragraph('Guia do Professor', { style: 'Title', align: 'center' }),
    paragraph(activityTitle, { style: 'Subtitle', align: 'center' }),
  ];
  const sections: Array<[string, string[]]> = [
    ['Objetivo da atividade', compact.objective],
    ['Adaptações aplicadas', compact.adaptations],
    ['Como aplicar', compact.steps],
    ['Apoios e formas de resposta', compact.supports],
    ['O que observar', compact.observations],
    ['Ampliação ou nova tentativa', compact.retry],
  ];
  for (const [title, values] of sections) {
    const cleanValues = values.filter(Boolean);
    if (!cleanValues.length) continue;
    body.push(paragraph(title, { style: 'Heading1' }));
    cleanValues.forEach(value => body.push(paragraph(cleanValues.length > 1 ? `• ${value}` : value)));
  }
  return body;
}

function textParagraphs(text: string): string[] {
  return normalizeMarkdownText(text)
    .split(/\n{2,}|\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => paragraph(line, { preserveBreaks: true }));
}

function labelForIncluiLabExercise(type: ActivityExercise['type']): string {
  const labels: Record<ActivityExercise['type'], string> = {
    multiple_choice: 'Marque a resposta',
    short_answer: 'Escreva a resposta',
    fill_blank: 'Complete',
    matching: 'Ligue as colunas',
    drawing: 'Desenhe',
    ordering: 'Coloque em ordem',
    word_search: 'Caça-palavras',
    crossword: 'Cruzadinha',
    coloring: 'Colorir',
    table: 'Complete a tabela',
  };
  return labels[type] ?? 'Responda';
}

function safeDocxFilename(filename: string): string {
  const base = safeFilename(String(filename || 'atividade_incluilab').replace(/\.docx$/i, '')) || 'atividade_incluilab';
  return `${base}.docx`;
}

function segmentStudentBlocks(blocks: ActivitySchema['blocks']): ActivitySchema['blocks'] {
  return blocks.flatMap(block => {
    if (!block.content || block.content.length < 900) return [block];
    const parts = splitIntoChunks(normalizeMarkdownText(block.content), 700).slice(0, 4);
    return parts.map((content, index) => ({
      ...block,
      id: `${block.id || 'base-text'}-parte-${index + 1}`,
      title: `${block.title || 'Texto'} - parte ${index + 1}`,
      content,
    }));
  });
}

function segmentExercisesForStudent(exercises: ActivityExercise[]): ActivityExercise[][] {
  if (exercises.length < 8) return [exercises];
  return [exercises.slice(0, 5), exercises.slice(5)];
}

function splitIntoChunks(text: string, maxChars: number): string[] {
  const sentences = text.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = '';
  for (const sentence of sentences.length ? sentences : [text]) {
    if (current && `${current} ${sentence}`.length > maxChars) {
      chunks.push(current);
      current = sentence;
    } else {
      current = current ? `${current} ${sentence}` : sentence;
    }
  }
  if (current) chunks.push(current);
  return chunks.length ? chunks : [text];
}

interface CompactTeacherGuide {
  objective: string[];
  adaptations: string[];
  steps: string[];
  supports: string[];
  observations: string[];
  retry: string[];
}

function compactTeacherGuide(guide: GuiaPedagogico): CompactTeacherGuide {
  return {
    objective: [clipWords(guide.objetivo_da_aula, 36)],
    adaptations: dedupeShort(guide.adaptacoes_inclusivas, 5, 28),
    steps: dedupeShort(splitGuideText(guide.metodologia_adaptada), 5, 30),
    supports: dedupeShort(guide.dicas_de_mediacao, 4, 30),
    observations: dedupeShort(guide.criterios_de_avaliacao, 4, 28),
    retry: [
      'Se houver dificuldade, retome o exemplo inicial e reduza uma etapa de cada vez.',
      'Para ampliar, mantenha o mesmo objetivo e aumente gradualmente a autonomia.',
    ],
  };
}

function splitGuideText(text: string): string[] {
  return normalizeMarkdownText(text)
    .split(/\n+|(?<=[.!?])\s+/)
    .map(item => item.replace(/^•\s*/, '').replace(/^\d+\.\s*/, '').trim())
    .filter(Boolean);
}

function dedupeShort(values: string[], limit: number, maxWords: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const clean = clipWords(value, maxWords);
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    result.push(clean);
    if (result.length >= limit) break;
  }
  return result;
}

function clipWords(value: string, maxWords: number): string {
  const clean = normalizeMarkdownText(value).replace(/\s+/g, ' ').trim();
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return clean;
  return `${words.slice(0, maxWords).join(' ')}.`;
}

function normalizeGridRowsForWord(grid: string[] | undefined, words: string[]): string[] {
  const explicit = (grid ?? []).map(row => row.replace(/\s+/g, '').toUpperCase()).filter(Boolean).slice(0, 12);
  if (explicit.length) return explicit;
  const letters = words.join('').replace(/[^a-zA-ZÀ-ÿ]/g, '').toUpperCase() || 'INCLUILAB';
  const alphabet = `${letters}ABCDEFGHIJKLMNOPQRSTUVWXYZ`;
  return Array.from({ length: 8 }, (_, rowIndex) =>
    Array.from({ length: 8 }, (_, colIndex) => alphabet[(rowIndex * 8 + colIndex) % alphabet.length]).join(''),
  );
}

function gridTableXml(rows: string[]): string {
  return simpleTableXml(rows.map(row => row.split('').map(letter => letter || ' ')), 420);
}

function simpleTableXml(rows: string[][], cellWidth = 2400): string {
  const tableRows = rows.map(row => `<w:tr>${row.map(cell => tableCellXml(cell, cellWidth)).join('')}</w:tr>`).join('');
  return `<w:tbl>
    <w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="0" w:type="auto"/><w:tblBorders>${tableBordersXml()}</w:tblBorders></w:tblPr>
    ${tableRows}
  </w:tbl>`;
}

function tableCellXml(text: string, width: number): string {
  return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/></w:tcPr>${paragraph(text || ' ')}</w:tc>`;
}

function tableBordersXml(): string {
  return '<w:top w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/><w:left w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/><w:right w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>';
}

function pageBreakXml(): string {
  return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
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
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/(^|\s)#{1,6}\s+([A-Za-zÀ-ÿ])/g, '$1$2')
    .replace(/^\s*[-*]\s+/gm, '• ')
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/\*\*([^*\n]*[A-Za-zÀ-ÿ][^*\n]*)\*\*/g, '$1')
    .replace(/__([^_\n]*[A-Za-zÀ-ÿ][^\n_]*)__/g, '$1')
    .replace(/(^|[\s([{"'“])\*([^*\n]*[A-Za-zÀ-ÿ][^*\n]*)\*(?=$|[\s)\].,;:!?"'”}])/g, '$1$2')
    .replace(/(^|[\s([{"'“])_([^_\n]*[A-Za-zÀ-ÿ][^_\n]*)_(?=$|[\s)\].,;:!?"'”}])/g, '$1$2')
    .replace(/\*\*+/g, '')
    .replace(/__+/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n');
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

/**
 * [FASE 1b] O RichTextEditor (src/components/RichTextEditor.tsx) persiste o
 * alinhamento escolhido pelo professor como `data-align="..."`, nunca como
 * `style="text-align:..."` (o sanitizador do editor recria os elementos e
 * descarta o style original). Por isso o DOCX nunca recebia
 * `w:jc w:val="both"` para parágrafos justificados — a leitura abaixo checava
 * somente `style`. Corrigida para checar `data-align` primeiro, com `style`
 * como fallback (mesma prioridade de getSafeAlignment em RichTextEditor.tsx).
 *
 * Extraída para escopo de módulo (e exportada) apenas para permitir teste
 * unitário sem depender de DOMParser/jsdom — aceita qualquer objeto com
 * `getAttribute`, não precisa ser um Element real do DOM.
 */
export function resolveWordParagraphAlign(
  el: { getAttribute(name: string): string | null },
): string {
  const dataAlign = (el.getAttribute('data-align') ?? '').toLowerCase();
  if (dataAlign === 'center' || dataAlign === 'right' || dataAlign === 'justify') return dataAlign;
  const m = (el.getAttribute('style') ?? '').match(/text-align\s*:\s*(center|right|justify)/i);
  return m ? m[1].toLowerCase() : 'left';
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

  const alignFromStyle = resolveWordParagraphAlign;

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
  // Um `label` explicitamente vazio ('') significa "este campo é um bloco de
  // texto corrido — sem subtítulo próprio" (usado pelos adaptadores da Fase 2
  // quando a seção já é o cabeçalho). `undefined` continua caindo no id/'Campo'.
  const label = field.label === '' ? '' : (field.label || field.id || 'Campo');

  if (label !== '') chunks.push(paragraph(label, { style: 'Heading2' }));

  // [FASE 2] Tabela de verdade quando o campo é tabular: value = string[][]
  // (linha 0 = cabeçalho). Usado pelos adaptadores (ex.: checklist de áreas do
  // Relatório Técnico, avaliação multidimensional).
  if (field.type === 'grid' && Array.isArray(field.value) && Array.isArray(field.value[0])) {
    const rows = (field.value as unknown[][]).map(r => r.map(c => String(c ?? '')));
    chunks.push(simpleTableXml(rows));
    return chunks.join('');
  }

  const raw = normalizeMarkdownToHtml(String(field.value ?? ''));

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
  if (docType === DocumentType.PDI) return 'Plano de Desenvolvimento Individual (PDI)';
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
    // Preserva um `label: ''` explícito (bloco de texto corrido, sem subtítulo);
    // só cai no fallback quando o label é ausente (undefined/null).
    const label = raw?.label === '' ? '' : String(raw?.label || raw?.title || raw?.id || `Campo ${fieldIndex + 1}`);
    return {
      id: String(raw?.id || `field_${fieldIndex + 1}`),
      label,
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
  <w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/><w:basedOn w:val="TableNormal"/><w:uiPriority w:val="59"/><w:qFormat/></w:style>
</w:styles>`;
}
