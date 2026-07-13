/**
 * studentDocumentImportService.ts
 * Serviço de importação de alunos por documento DOCX com IA.
 *
 * Responsabilidades:
 *  - Extrair texto de .docx com mammoth
 *  - Enviar para AI Gateway e obter draft estruturado
 *  - Normalizar e validar o draft
 *  - Persistir cada aluno confirmado via databaseService
 *
 * Arquitetura para futuros formatos (não implementado):
 *  - PDF texto   → pdfjs-dist extractText()
 *  - PDF imagem  → OCR via Gemini Vision (callAIGateway task:'image')
 *  - Imagem/foto → mesma rota Vision, prompt adaptado
 *  Quando implementar: criar extractTextFromPdf(file) e extractTextFromImage(file)
 *  que retornem Promise<string> — o restante do pipeline não muda.
 */

import * as mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist';
import { callAIGateway } from './aiGatewayService';
import { databaseService } from './databaseService';
import { AI_CREDIT_COSTS } from '../config/aiCosts';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).href;

// ─── Tipos públicos ──────────────────────────────────────────────────────────

export interface StudentDocumentDraft {
  name: string;
  birthDate?: string;
  gender?: string;
  schoolName?: string;
  grade?: string;
  shift?: string;
  regentTeacher?: string;
  aeeTeacher?: string;
  coordinator?: string;
  guardianName?: string;
  guardianPhone?: string;
  guardianEmail?: string;
  diagnosis?: string[];
  cid?: string;
  supportLevel?: string;
  medication?: string;
  abilities?: string[];
  difficulties?: string[];
  strategies?: string[];
  communication?: string[];
  schoolHistory?: string;
  familyContext?: string;
  observations?: string;
  recommendations?: string;
  needsReview?: string[];
  confidence?: number;
}

/** Versão editável — arrays como strings separadas por newline (para textarea) */
export interface EditableDraft {
  name: string;
  birthDate: string;
  gender: string;
  schoolName: string;
  grade: string;
  shift: string;
  regentTeacher: string;
  aeeTeacher: string;
  coordinator: string;
  guardianName: string;
  guardianPhone: string;
  guardianEmail: string;
  diagnosis: string;
  cid: string;
  supportLevel: string;
  medication: string;
  abilities: string;
  difficulties: string;
  strategies: string;
  communication: string;
  schoolHistory: string;
  familyContext: string;
  observations: string;
  recommendations: string;
  needsReview: string[];
  confidence: number;
}

export interface DocxValidationResult {
  isValid: boolean;
  missingFields: string[];
  flaggedFields: string[];
}

export interface DocxSaveResult {
  saved: number;
  errors: string[];
}

export type ImportFileType = 'docx' | 'pdf-text' | 'pdf-image' | 'image';

// Reexporta para o modal exibir na UI — fonte única em aiCosts.ts
export const CREDITS_DOC_TEXT = AI_CREDIT_COSTS.IMPORTAR_DOCUMENTO_TEXTO;
export const CREDITS_VISUAL   = AI_CREDIT_COSTS.IMPORTAR_DOCUMENTO_VISUAL;

/**
 * Resultado de chamada IA de importação com reserva diferida.
 * O frontend deve confirmar (commit) após salvar no banco ou liberar (release) em caso de falha/cancelamento.
 */
export interface DocxAiResult {
  drafts: StudentDocumentDraft[];
  reservationId: string | null;
  creditsConsumed: number;
}

// ─── Extração de texto ───────────────────────────────────────────────────────

export async function extractTextFromDocx(file: File): Promise<string> {
  const t0 = performance.now();
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  const text = result.value.trim();
  const ms = Math.round(performance.now() - t0);
  console.info('[DocImport] Texto extraído em', ms, 'ms —', text.length, 'caracteres');
  if (!text) {
    throw new Error(
      'O arquivo Word não contém texto extraível. Verifique se o documento não está protegido ou vazio.'
    );
  }
  return text;
}

// ─── Chamada à IA ────────────────────────────────────────────────────────────

export async function mapDocumentTextToStudentPayload(
  text: string
): Promise<DocxAiResult> {
  const prompt = `Você é um assistente especializado em educação inclusiva brasileira. Analise o texto abaixo — pode ser uma ficha, anamnese ou relatório pedagógico — e extraia os dados de aluno(s) em JSON estruturado.

REGRAS ABSOLUTAS — INTEGRIDADE DOS DADOS:
1. NUNCA invente, suponha ou infira informações. Se o dado não está explicitamente no texto, omita o campo.
2. Não use strings como "Não informado", "N/A", "—" ou similares. Omita o campo completamente.
3. Se houver mais de um aluno identificável, retorne um item por aluno no array "students".
4. Campos extraídos com incerteza ou ambiguidade: inclua o nome exato do campo em "needsReview".
5. gender: "M", "F" ou "OTHER". Omita se não informado no texto.
6. birthDate: formato YYYY-MM-DD. Omita se data de nascimento não encontrada.
7. diagnosis: array de strings (um diagnóstico por item). Extraia APENAS diagnósticos literalmente presentes.
8. abilities, difficulties, strategies, communication: arrays de frases curtas.
9. confidence: 0 a 1 indicando certeza geral da extração.

CAMPOS SENSÍVEIS — PROIBIDO INVENTAR:
- cid: extraia APENAS se um código CID aparecer literalmente (ex: F84.0, F90, G40). Omita se ausente.
- diagnosis: APENAS diagnósticos explicitamente escritos. Nunca infira pelo contexto.
- medication: APENAS medicamentos literalmente mencionados pelo nome. Omita se ausente.
- guardianName: APENAS nome escrito no documento. Nunca deduza.
- guardianPhone: APENAS telefone presente no texto. Nunca complete dígitos faltando.
Em caso de dúvida sobre qualquer campo: inclua em needsReview e omita o valor.

RETORNE SOMENTE JSON VÁLIDO (sem markdown, sem texto extra):
{
  "students": [{
    "name": "...", "birthDate": "YYYY-MM-DD", "gender": "M|F|OTHER",
    "schoolName": "...", "grade": "...", "shift": "...",
    "regentTeacher": "...", "aeeTeacher": "...", "coordinator": "...",
    "guardianName": "...", "guardianPhone": "...", "guardianEmail": "...",
    "diagnosis": ["..."], "cid": "...", "supportLevel": "...", "medication": "...",
    "abilities": ["..."], "difficulties": ["..."],
    "strategies": ["..."], "communication": ["..."],
    "schoolHistory": "...", "familyContext": "...",
    "observations": "...", "recommendations": "...",
    "needsReview": ["campo1"], "confidence": 0.9
  }]
}

TEXTO DO DOCUMENTO:
${text.substring(0, 8000)}`;

  const t1 = performance.now();
  const response = await callAIGateway({
    task: 'json',
    prompt,
    creditsRequired: CREDITS_DOC_TEXT,
    requestType: 'document_import',
    deferCommit: true,
  });
  const aiMs = Math.round(performance.now() - t1);
  console.info('[DocImport] Resposta IA em', aiMs, 'ms — reservationId:', response.reservationId ?? 'none');

  let parsed: any;
  try {
    parsed = JSON.parse(response.result);
  } catch {
    throw new Error('A IA retornou um formato inválido. Tente novamente.');
  }

  if (!parsed?.students || !Array.isArray(parsed.students) || parsed.students.length === 0) {
    throw new Error(
      'Não foi possível identificar dados de aluno no documento. Verifique se o arquivo contém fichas ou anamneses.'
    );
  }

  const normalized = parsed.students
    .map(normalizeImportedStudentFromDocument)
    .filter((d: StudentDocumentDraft) => d.name.trim().length > 0);

  if (normalized.length === 0) {
    throw new Error('O documento não contém alunos com nome identificável.');
  }

  const lowConfFields = normalized.flatMap((d: StudentDocumentDraft) => d.needsReview ?? []);
  console.info(
    '[DocImport] Alunos encontrados:', normalized.length,
    '| Campos baixa confiança:', lowConfFields.length > 0 ? lowConfFields.join(', ') : 'nenhum',
    '| Confiança média:', (normalized.reduce((s: number, d: StudentDocumentDraft) => s + (d.confidence ?? 0.5), 0) / normalized.length).toFixed(2),
  );

  return {
    drafts: normalized,
    reservationId: response.reservationId ?? null,
    creditsConsumed: CREDITS_DOC_TEXT,
  };
}

// ─── Normalização ────────────────────────────────────────────────────────────

export function normalizeImportedStudentFromDocument(raw: any): StudentDocumentDraft {
  const toArr = (v: any): string[] | undefined => {
    if (!v) return undefined;
    const arr = Array.isArray(v)
      ? v.filter(Boolean).map(String)
      : String(v).split(/[;\n]+/).map((s: string) => s.trim()).filter(Boolean);
    return arr.length > 0 ? arr : undefined;
  };

  const draft: StudentDocumentDraft = {
    name: String(raw.name ?? '').trim(),
  };

  if (raw.birthDate)     draft.birthDate     = String(raw.birthDate);
  if (['M','F','OTHER'].includes(raw.gender)) draft.gender = raw.gender;
  if (raw.schoolName)    draft.schoolName    = String(raw.schoolName);
  if (raw.grade)         draft.grade         = String(raw.grade);
  if (raw.shift)         draft.shift         = String(raw.shift);
  if (raw.regentTeacher) draft.regentTeacher = String(raw.regentTeacher);
  if (raw.aeeTeacher)    draft.aeeTeacher    = String(raw.aeeTeacher);
  if (raw.coordinator)   draft.coordinator   = String(raw.coordinator);
  if (raw.guardianName)  draft.guardianName  = String(raw.guardianName);
  if (raw.guardianPhone) draft.guardianPhone = String(raw.guardianPhone);
  if (raw.guardianEmail) draft.guardianEmail = String(raw.guardianEmail);
  if (raw.cid)           draft.cid           = String(raw.cid).toUpperCase();
  if (raw.supportLevel)  draft.supportLevel  = String(raw.supportLevel);
  if (raw.medication)    draft.medication    = String(raw.medication);
  if (raw.schoolHistory) draft.schoolHistory = String(raw.schoolHistory);
  if (raw.familyContext) draft.familyContext = String(raw.familyContext);
  if (raw.observations)  draft.observations  = String(raw.observations);
  if (raw.recommendations) draft.recommendations = String(raw.recommendations);

  const diagnosis    = toArr(raw.diagnosis);    if (diagnosis)    draft.diagnosis    = diagnosis;
  const abilities    = toArr(raw.abilities);    if (abilities)    draft.abilities    = abilities;
  const difficulties = toArr(raw.difficulties); if (difficulties) draft.difficulties = difficulties;
  const strategies   = toArr(raw.strategies);   if (strategies)   draft.strategies   = strategies;
  const communication = toArr(raw.communication); if (communication) draft.communication = communication;

  draft.needsReview = Array.isArray(raw.needsReview) ? raw.needsReview.map(String) : [];
  draft.confidence  = typeof raw.confidence === 'number'
    ? Math.min(1, Math.max(0, raw.confidence))
    : 0.5;

  return draft;
}

// ─── Draft → editável ────────────────────────────────────────────────────────

export function draftToEditable(d: StudentDocumentDraft): EditableDraft {
  return {
    name:            d.name ?? '',
    birthDate:       d.birthDate ?? '',
    gender:          d.gender ?? '',
    schoolName:      d.schoolName ?? '',
    grade:           d.grade ?? '',
    shift:           d.shift ?? '',
    regentTeacher:   d.regentTeacher ?? '',
    aeeTeacher:      d.aeeTeacher ?? '',
    coordinator:     d.coordinator ?? '',
    guardianName:    d.guardianName ?? '',
    guardianPhone:   d.guardianPhone ?? '',
    guardianEmail:   d.guardianEmail ?? '',
    diagnosis:       (d.diagnosis ?? []).join('\n'),
    cid:             d.cid ?? '',
    supportLevel:    d.supportLevel ?? '',
    medication:      d.medication ?? '',
    abilities:       (d.abilities ?? []).join('\n'),
    difficulties:    (d.difficulties ?? []).join('\n'),
    strategies:      (d.strategies ?? []).join('\n'),
    communication:   (d.communication ?? []).join('\n'),
    schoolHistory:   d.schoolHistory ?? '',
    familyContext:   d.familyContext ?? '',
    observations:    d.observations ?? '',
    recommendations: d.recommendations ?? '',
    needsReview:     d.needsReview ?? [],
    confidence:      d.confidence ?? 0.5,
  };
}

// ─── Validação ───────────────────────────────────────────────────────────────

export function validateImportedStudentDraft(draft: StudentDocumentDraft): DocxValidationResult {
  const missingFields: string[] = [];
  if (!draft.name?.trim())  missingFields.push('Nome');
  if (!draft.guardianName)  missingFields.push('Responsável');
  if (!draft.guardianPhone) missingFields.push('Telefone');
  if (!draft.grade)         missingFields.push('Série/Ano');
  return {
    isValid:       !!draft.name?.trim(),
    missingFields,
    flaggedFields: draft.needsReview ?? [],
  };
}

// ─── Persistência ────────────────────────────────────────────────────────────

// Mapeia tipo de arquivo UI para o valor aceito pela constraint students_import_source_check
// Constraint aceita: 'manual' | 'csv' | 'ai_converter'
function toDbImportSource(source: string): 'manual' | 'csv' | 'ai_converter' {
  if (source === 'csv') return 'csv';
  if (source === 'manual') return 'manual';
  // 'docx', 'pdf-text', 'pdf-image', 'image' → todos são conversão via IA
  return 'ai_converter';
}

export async function saveStudentsFromDocx(
  editables: EditableDraft[],
  tenantId: string,
  userId: string,
  importSource = 'docx',
): Promise<DocxSaveResult> {
  const splitArr = (s: string): string[] =>
    s.split('\n').map((x: string) => x.trim()).filter(Boolean);

  const dbSource = toDbImportSource(importSource);
  let saved = 0;
  const errors: string[] = [];

  for (const e of editables) {
    try {
      const isComplete = !!(e.guardianName && e.guardianPhone && e.grade);
      await databaseService.saveStudent({
        tenant_id:           tenantId,
        created_by:          userId,
        name:                e.name,
        birthDate:           e.birthDate || undefined,
        gender:              e.gender || undefined,
        schoolName:          e.schoolName || undefined,
        grade:               e.grade || undefined,
        shift:               e.shift || undefined,
        regentTeacher:       e.regentTeacher || undefined,
        aeeTeacher:          e.aeeTeacher || undefined,
        coordinator:         e.coordinator || undefined,
        guardianName:        e.guardianName || undefined,
        guardianPhone:       e.guardianPhone || undefined,
        guardianEmail:       e.guardianEmail || undefined,
        diagnosis:           splitArr(e.diagnosis),
        cid:                 e.cid || undefined,
        supportLevel:        e.supportLevel || undefined,
        medication:          e.medication || undefined,
        abilities:           splitArr(e.abilities),
        difficulties:        splitArr(e.difficulties),
        strategies:          splitArr(e.strategies),
        communication:       splitArr(e.communication),
        schoolHistory:       e.schoolHistory || undefined,
        familyContext:       e.familyContext || undefined,
        observations:        e.observations || undefined,
        import_source:       dbSource,
        registration_status: isComplete ? 'complete' : 'incomplete',
        is_pre_registered:   !isComplete,
        is_active:           true,
        tipo_aluno:          'com_laudo',
      });
      saved++;
    } catch (err: any) {
      const label = e.name || 'Aluno sem nome';
      errors.push(`${label}: ${err?.message ?? String(err)}`);
    }
  }

  return { saved, errors };
}

// ─── PDF: extração de texto ──────────────────────────────────────────────────

/**
 * Tenta extrair texto de um PDF. Retorna null se o PDF for escaneado/sem texto.
 * Usa pdfjs-dist no browser, sem chamada à IA — nenhum crédito consumido aqui.
 */
export async function extractTextFromPdf(file: File): Promise<string | null> {
  const t0 = performance.now();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  let fullText = '';
  const pageLimit = Math.min(pdf.numPages, 5);

  for (let pageNum = 1; pageNum <= pageLimit; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .filter((item): item is pdfjsLib.TextItem => 'str' in item)
      .map(item => item.str)
      .join(' ');
    fullText += pageText + '\n';
  }

  const cleaned = fullText.replace(/\s+/g, ' ').trim();
  const ms = Math.round(performance.now() - t0);
  console.info(
    '[DocImport] PDF text extraction:', ms, 'ms —', cleaned.length, 'chars,', pdf.numPages, 'páginas'
  );

  return cleaned.length >= 80 ? cleaned : null;
}

// ─── Helpers internos ────────────────────────────────────────────────────────

async function renderPdfFirstPageToBase64(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 2.0 });

  const canvas = document.createElement('canvas');
  canvas.width  = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;

  return canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ─── Processamento visual (imagem / PDF escaneado) ───────────────────────────

export async function mapVisualDocumentToStudentPayload(
  file: File,
): Promise<DocxAiResult> {
  const t0 = performance.now();
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

  const imageBase64 = isPdf
    ? await renderPdfFirstPageToBase64(file)
    : await fileToBase64(file);

  const prompt = `Você é especialista em educação inclusiva brasileira com capacidade de análise visual de documentos.
Analise a IMAGEM deste documento — pode ser uma ficha pedagógica, anamnese, laudo ou relatório escaneado/fotografado/manuscrito.

REGRAS ABSOLUTAS — INTEGRIDADE DOS DADOS:
1. NUNCA invente, suponha ou infira informações. Se o dado não estiver visível e legível na imagem, omita o campo.
2. Não use strings como "Não informado", "N/A", "—" ou similares. Omita o campo completamente.
3. Campos com texto ilegível ou duvidoso: inclua o nome do campo em "needsReview". Não tente adivinhar.
4. gender: "M", "F" ou "OTHER". Omita se não identificável.
5. birthDate: formato YYYY-MM-DD. Omita se não visível.
6. diagnosis: array de strings. Extraia APENAS diagnósticos claramente visíveis.
7. confidence: 0 a 1. Documentos pouco legíveis devem ter valor baixo (≤ 0.4).

CAMPOS SENSÍVEIS — PROIBIDO INVENTAR:
- cid: APENAS se código CID visível literalmente (ex: F84.0). Omita se ausente.
- diagnosis: APENAS diagnósticos explicitamente escritos. Nunca infira.
- medication: APENAS medicamentos mencionados pelo nome. Omita se ausente.
- guardianPhone: APENAS telefone visível. Nunca complete dígitos incompletos.

RETORNE SOMENTE JSON VÁLIDO (sem markdown, sem comentários, sem texto extra):
{"students":[{"name":"...","birthDate":"YYYY-MM-DD","gender":"M|F|OTHER","schoolName":"...","grade":"...","shift":"...","regentTeacher":"...","aeeTeacher":"...","coordinator":"...","guardianName":"...","guardianPhone":"...","guardianEmail":"...","diagnosis":["..."],"cid":"...","supportLevel":"...","medication":"...","abilities":["..."],"difficulties":["..."],"strategies":["..."],"communication":["..."],"schoolHistory":"...","familyContext":"...","observations":"...","recommendations":"...","needsReview":["campo1"],"confidence":0.9}]}`;

  const response = await callAIGateway({
    task:            'image',
    prompt,
    imageBase64,
    creditsRequired: CREDITS_VISUAL,
    requestType:     'document_import_visual',
    deferCommit:     true,
  });

  const ms = Math.round(performance.now() - t0);
  console.info('[DocImport] Visual AI response em', ms, 'ms');

  // Strip possible markdown code fences the model may include
  const raw = response.result
    .replace(/^```(?:json)?\s*/m, '')
    .replace(/\s*```\s*$/m, '')
    .trim();

  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      'A IA não conseguiu organizar as informações do documento. Tente com uma imagem mais nítida.'
    );
  }

  if (!parsed?.students || !Array.isArray(parsed.students) || parsed.students.length === 0) {
    throw new Error(
      'Não foi possível identificar dados de aluno no documento. Verifique se a imagem contém fichas ou anamneses legíveis.'
    );
  }

  const normalized = parsed.students
    .map(normalizeImportedStudentFromDocument)
    .filter((d: StudentDocumentDraft) => d.name.trim().length > 0);

  const avgConf = normalized.length > 0
    ? normalized.reduce((s: number, d: StudentDocumentDraft) => s + (d.confidence ?? 0.5), 0) / normalized.length
    : 0;

  console.info(
    '[DocImport] Visual — alunos:', normalized.length,
    '| confiança média:', avgConf.toFixed(2),
  );

  if (normalized.length === 0 || avgConf < 0.25) {
    throw new Error(
      'Não conseguimos ler o documento com segurança. Tente enviar uma imagem mais nítida ou preencher manualmente.'
    );
  }

  console.info('[DocImport] Visual — reservationId:', response.reservationId ?? 'none');

  return {
    drafts: normalized,
    reservationId: response.reservationId ?? null,
    creditsConsumed: CREDITS_VISUAL,
  };
}
