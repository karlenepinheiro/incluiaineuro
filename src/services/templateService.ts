/**
 * templateService.ts
 * Modelos Personalizados da Escola — lógica completa de:
 *  1. Upload do .docx original para Supabase Storage
 *  2. Extração de texto com mammoth (browser-compatible)
 *  3. Análise pela IA Gemini: classificação + mapa de substituição
 *  4. Injeção de tags no XML do .docx preservando formatação
 *  5. Salvamento do arquivo preparado no Storage
 *  6. Persistência de metadados na tabela school_templates
 */

import PizZip from 'pizzip';
import * as mammoth from 'mammoth';
import { supabase } from './supabase';
import { AIService } from './aiService';
import type { User } from '../types';

// ─── Tipagens ────────────────────────────────────────────────────────────────

export type TemplateDocType = 'PEI' | 'PAEE' | 'PDI' | 'estudo_de_caso' | 'outro';

export interface TemplateTag {
  tag: string;         // ex: "{{nome_estudante}}"
  label: string;       // ex: "Nome do Estudante"
  found: boolean;      // se foi encontrado no docx
}

export interface TemplateReplacement {
  find: string;        // texto original no docx (ex: "Nome: ___________")
  tag: string;         // tag a injetar  (ex: "{{nome_estudante}}")
  label: string;       // rótulo amigável
}

export interface SchoolTemplate {
  id: string;
  tenantId: string;
  createdBy?: string;
  name: string;
  originalFilename: string;
  description?: string;
  documentType?: TemplateDocType;
  aiConfidence?: number;
  aiReasoning?: string;
  status: 'pending' | 'processing' | 'ready' | 'error';
  errorMessage?: string;
  storagePathOriginal?: string;
  storagePathPrepared?: string;
  tagsInjected: TemplateTag[];
  replacementsMap: TemplateReplacement[];
  isActive: boolean;
  timesUsed: number;
  createdAt: string;
  updatedAt: string;
}

// ─── Dicionário de tags padrão IncluiAI ─────────────────────────────────────

export const STANDARD_TAGS: TemplateTag[] = [
  { tag: '{{nome_estudante}}',        label: 'Nome do Estudante',           found: false },
  { tag: '{{data_nascimento}}',       label: 'Data de Nascimento',          found: false },
  { tag: '{{idade}}',                 label: 'Idade',                       found: false },
  { tag: '{{genero}}',                label: 'Gênero / Sexo',               found: false },
  { tag: '{{escola}}',                label: 'Nome da Escola',              found: false },
  { tag: '{{turma}}',                 label: 'Turma / Série / Ano',         found: false },
  { tag: '{{turno}}',                 label: 'Turno',                       found: false },
  { tag: '{{professor_regente}}',     label: 'Professor Regente',           found: false },
  { tag: '{{professor_aee}}',         label: 'Professor AEE / SRM',         found: false },
  { tag: '{{coordenador}}',           label: 'Coordenador Pedagógico',      found: false },
  { tag: '{{responsavel}}',           label: 'Responsável / Familiar',      found: false },
  { tag: '{{telefone_responsavel}}',  label: 'Telefone do Responsável',     found: false },
  { tag: '{{diagnostico}}',           label: 'Diagnóstico / Condição',      found: false },
  { tag: '{{cid}}',                   label: 'CID',                         found: false },
  { tag: '{{nivel_suporte}}',         label: 'Nível de Suporte',            found: false },
  { tag: '{{medicacao}}',             label: 'Medicação',                   found: false },
  { tag: '{{periodo_letivo}}',        label: 'Período Letivo / Ano',        found: false },
  { tag: '{{data_elaboracao}}',       label: 'Data de Elaboração',          found: false },
  { tag: '{{profissional_responsavel}}', label: 'Profissional Responsável', found: false },
  { tag: '{{metas}}',                 label: 'Metas e Objetivos',           found: false },
  { tag: '{{estrategias}}',           label: 'Estratégias Pedagógicas',     found: false },
  { tag: '{{recursos}}',              label: 'Recursos e Materiais',        found: false },
  { tag: '{{avaliacao}}',             label: 'Avaliação / Resultados',      found: false },
  { tag: '{{observacoes}}',           label: 'Observações Gerais',          found: false },
  { tag: '{{habilidades}}',           label: 'Habilidades / Potencialidades', found: false },
  { tag: '{{dificuldades}}',          label: 'Dificuldades / Desafios',     found: false },
  { tag: '{{historico_escolar}}',     label: 'Histórico Escolar',           found: false },
  { tag: '{{contexto_familiar}}',     label: 'Contexto Familiar',           found: false },
  { tag: '{{comunicacao}}',           label: 'Comunicação',                 found: false },
];

// ─── Labels por tipo de documento ────────────────────────────────────────────

export const DOC_TYPE_LABELS: Record<TemplateDocType, string> = {
  PEI:           'PEI — Plano Educacional Individualizado',
  PAEE:          'PAEE — Plano de AEE',
  PDI:           'PDI — Plano de Desenvolvimento Individual',
  estudo_de_caso:'Estudo de Caso',
  outro:         'Outro Documento',
};

// ─── Extração de texto do DOCX ───────────────────────────────────────────────
// Usa mammoth (import estático) para extrair texto limpo do .docx.
// O texto resultante é UMA STRING PURA — nunca um buffer/blob —
// e é a ÚNICA coisa enviada à IA. O arquivo .docx jamais vai para o Gemini.

async function extractTextFromDocx(arrayBuffer: ArrayBuffer): Promise<string> {
  // ── Tentativa 1: mammoth (import estático, suporta browser via Vite) ─────────
  try {
    // mammoth.extractRawText aceita { arrayBuffer: ArrayBuffer } no browser
    const result = await mammoth.extractRawText({ arrayBuffer });
    const text = result?.value?.trim() ?? '';
    if (text.length > 20) {
      console.info('[templateService] Texto extraído via mammoth:', text.length, 'chars');
      return text;
    }
    if (result?.messages?.length) {
      console.warn('[templateService] mammoth warnings:', result.messages);
    }
  } catch (err) {
    console.warn('[templateService] mammoth falhou, usando fallback XML:', err);
  }

  // ── Tentativa 2: leitura direta do XML do document.xml (fallback) ────────────
  // Não envia nada para IA — só extrai strings de <w:t> do ZIP
  try {
    const zip = new PizZip(arrayBuffer);
    const xmlContent = zip.files['word/document.xml']?.asText() ?? '';

    if (!xmlContent) {
      throw new Error('word/document.xml não encontrado no arquivo.');
    }

    // Extrai texto parágrafo por parágrafo para preservar quebras de linha
    const paragraphs: string[] = [];
    const paraRegex = /<w:p[ >][\s\S]*?<\/w:p>/g;
    let paraMatch: RegExpExecArray | null;

    while ((paraMatch = paraRegex.exec(xmlContent)) !== null) {
      const paraXml = paraMatch[0];
      const textParts: string[] = [];
      const textRegex = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g;
      let tMatch: RegExpExecArray | null;
      while ((tMatch = textRegex.exec(paraXml)) !== null) {
        textParts.push(tMatch[1]);
      }
      const line = textParts.join('')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .trim();
      if (line) paragraphs.push(line);
    }

    const text = paragraphs.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    console.info('[templateService] Texto extraído via XML fallback:', text.length, 'chars');
    return text;
  } catch (err: any) {
    throw new Error(
      `Não foi possível ler o arquivo .docx: ${err?.message ?? err}. ` +
      'Verifique se o arquivo não está corrompido ou protegido por senha.'
    );
  }
}

// ─── Análise pela IA ─────────────────────────────────────────────────────────

interface AIAnalysisResult {
  documentType: TemplateDocType;
  confidence: number;
  reasoning: string;
  replacements: TemplateReplacement[];
}

async function analyzeWithAI(docText: string): Promise<AIAnalysisResult> {
  // ⚠️  GUARDA DE SEGURANÇA: confirma que recebemos uma string de texto puro.
  // Jamais deve receber ArrayBuffer, Blob ou qualquer objeto — apenas string.
  if (typeof docText !== 'string') {
    throw new Error(
      '[templateService] analyzeWithAI recebeu um tipo inesperado: ' +
      typeof docText + '. Apenas texto puro é enviado à IA.'
    );
  }
  if (docText.trim().length < 20) {
    throw new Error(
      'O texto extraído do documento é muito curto para análise. ' +
      'Verifique se o arquivo contém texto (não é uma imagem escaneada).'
    );
  }

  // docText é a string limpa do mammoth — nenhum buffer vai para o Gemini
  console.info('[templateService] analyzeWithAI → enviando', docText.length, 'chars de texto puro para Gemini');

  const tagList = STANDARD_TAGS.map(t => `${t.tag} → ${t.label}`).join('\n');

  const prompt = `
Você é um especialista em Educação Especial e Inclusiva no Brasil.
Analise o texto abaixo, extraído de um documento Word (.docx) enviado por uma escola.

═══════════════════════════════
TEXTO DO DOCUMENTO:
${docText.slice(0, 6000)}
═══════════════════════════════

TAREFA 1 — CLASSIFICAÇÃO:
Identifique o tipo de documento. As categorias possíveis são:
- "PEI" (Plano Educacional Individualizado)
- "PAEE" (Plano de AEE / Atendimento Educacional Especializado)
- "PDI" (Plano de Desenvolvimento Individual)
- "estudo_de_caso" (Estudo de Caso / Relatório de Avaliação)
- "outro" (qualquer outro tipo)

TAREFA 2 — INJEÇÃO DE TAGS:
Identifique TODOS os campos em branco no documento (representados por "_______", "( )", espaços de preenchimento, ou campos vazios após dois-pontos).
Para cada campo em branco, determine qual tag do sistema IncluiAI deve substituí-lo.

DICIONÁRIO DE TAGS DISPONÍVEIS:
${tagList}

REGRAS IMPORTANTES:
1. "find" deve ser o TEXTO EXATO que aparece no documento, incluindo o label antes do campo (ex: "Nome do Aluno: ___________")
2. Se o campo tiver apenas underscores sem label contextual, inclua o máximo de contexto possível
3. Use apenas tags do dicionário acima. Se não houver tag correspondente, não inclua esse campo.
4. Se o mesmo campo aparecer múltiplas vezes, inclua apenas uma vez.
5. Prefira correspondências exatas — não invente campos que não existem no texto.

RESPONDA APENAS COM JSON NO FORMATO:
{
  "documentType": "PEI",
  "confidence": 0.95,
  "reasoning": "O documento contém seções típicas de PEI como metas pedagógicas individualizadas e...",
  "replacements": [
    {
      "find": "Nome do Aluno: ___________",
      "tag": "{{nome_estudante}}",
      "label": "Nome do Estudante"
    }
  ]
}
`.trim();

  let rawJson: string;
  try {
    // generateFromPrompt usa o aiProvider interno (Gemini) sem exigir User
    rawJson = await AIService.generateFromPrompt(prompt, null as unknown as User);
  } catch (err: any) {
    throw new Error(`IA não disponível: ${err?.message ?? err}`);
  }

  // Limpeza robusta do JSON
  const cleaned = rawJson
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .replace(/^\uFEFF/, '')
    .trim();

  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // Tenta extrair o JSON com regex
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try { parsed = JSON.parse(match[0]); } catch { /* segue */ }
    }
    if (!parsed) {
      throw new Error('A IA retornou uma resposta inválida. Tente novamente.');
    }
  }

  return {
    documentType: parsed.documentType ?? 'outro',
    confidence:   typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
    reasoning:    parsed.reasoning ?? '',
    replacements: Array.isArray(parsed.replacements) ? parsed.replacements : [],
  };
}

// ─── Injeção de tags no XML do .docx ─────────────────────────────────────────
// Estratégia: trabalha em nível de parágrafo (<w:p>).
// Para cada parágrafo, concatena o texto de todos os <w:t>,
// verifica se algum replacement corresponde e, se sim,
// substitui os runs de underscore pela tag correspondente.

function injectTagsInDocx(
  arrayBuffer: ArrayBuffer,
  replacements: TemplateReplacement[]
): { buffer: Uint8Array; tagsFound: TemplateTag[] } {
  if (replacements.length === 0) {
    // Nenhuma substituição — devolve o arquivo original
    return { buffer: new Uint8Array(arrayBuffer), tagsFound: [] };
  }

  const zip = new PizZip(arrayBuffer);
  const docXmlFile = zip.files['word/document.xml'];
  if (!docXmlFile) throw new Error('Arquivo .docx inválido: word/document.xml não encontrado.');

  let xml = docXmlFile.asText();
  const tagsFoundSet = new Set<string>();

  // ── Abordagem 1: substituição direta de texto dentro de <w:t> ──
  // Escapa o texto para XML e tenta substituição direta.
  for (const rep of replacements) {
    if (!rep.find || !rep.tag) continue;

    // Versão XML-escaped do texto a encontrar
    const xmlEscaped = rep.find
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');

    // Tentativa direta (texto está num único <w:t>)
    if (xml.includes(xmlEscaped)) {
      xml = xml.split(xmlEscaped).join(rep.tag);
      tagsFoundSet.add(rep.tag);
      continue;
    }

    // Versão sem escape (texto simples)
    if (xml.includes(rep.find)) {
      xml = xml.split(rep.find).join(rep.tag);
      tagsFoundSet.add(rep.tag);
      continue;
    }

    // ── Abordagem 2: substituição em nível de parágrafo ──
    // Se o texto está dividido entre múltiplos <w:r> runs,
    // reconstruímos o parágrafo e verificamos se o texto concatenado contém o padrão.
    const paragraphRegex = /<w:p[ >][\s\S]*?<\/w:p>/g;
    let modified = false;

    xml = xml.replace(paragraphRegex, (paragraph) => {
      if (modified) return paragraph;

      // Extrai texto combinado do parágrafo
      const textMatches = [...paragraph.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)];
      const combinedText = textMatches.map(m => m[1]).join('');
      const combinedDecoded = combinedText
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&apos;/g, "'");

      // Verifica se o parágrafo contém o padrão de busca
      const findDecoded = rep.find
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&apos;/g, "'");

      if (!combinedDecoded.includes(findDecoded)) return paragraph;

      // Encontrado! Substitui os underscores no último <w:t> do parágrafo
      // que contém "___" pelo tag
      const underscoreRunRegex = /<w:t[^>]*>([^<]*_{3,}[^<]*)<\/w:t>/;
      if (underscoreRunRegex.test(paragraph)) {
        const newParagraph = paragraph.replace(underscoreRunRegex, (match, content) => {
          const replaced = content.replace(/_{3,}/, rep.tag);
          return match.replace(content, replaced);
        });
        if (newParagraph !== paragraph) {
          modified = true;
          tagsFoundSet.add(rep.tag);
          return newParagraph;
        }
      }

      return paragraph;
    });
  }

  // ── Abordagem 3: substitui underscores restantes com contexto heurístico ──
  // Para campos que não foram identificados via IA mas têm underscores óbvios
  const remainingUnderscores: Array<[RegExp, string]> = [
    [/Nome[\s:]+_{3,}/gi,            '{{nome_estudante}}'],
    [/Data de Nascimento[\s:]+_{3,}/gi, '{{data_nascimento}}'],
    [/Escola[\s:]+_{3,}/gi,          '{{escola}}'],
    [/Turma[\s:]+_{3,}/gi,           '{{turma}}'],
    [/Turno[\s:]+_{3,}/gi,           '{{turno}}'],
    [/Diagnóstico[\s:]+_{3,}/gi,     '{{diagnostico}}'],
    [/CID[\s:]+_{3,}/gi,             '{{cid}}'],
    [/Responsável[\s:]+_{3,}/gi,     '{{responsavel}}'],
    [/Professor[\s(]+AEE[)\s:]+_{3,}/gi, '{{professor_aee}}'],
    [/Professor Regente[\s:]+_{3,}/gi,   '{{professor_regente}}'],
    [/Data[\s:]+_{3,}/gi,            '{{data_elaboracao}}'],
    [/Período[\s:]+_{3,}/gi,         '{{periodo_letivo}}'],
  ];

  for (const [pattern, tag] of remainingUnderscores) {
    const before = xml;
    xml = xml.replace(pattern, (match) => {
      const withTag = match.replace(/_{3,}/, tag);
      tagsFoundSet.add(tag);
      return withTag;
    });
    if (xml !== before) tagsFoundSet.add(tag);
  }

  // Salva XML modificado de volta no ZIP
  zip.file('word/document.xml', xml);

  const outputBuffer = zip.generate({ type: 'uint8array', compression: 'DEFLATE' });

  // Mapeia tags encontradas para o formato TemplateTag
  const tagsFound: TemplateTag[] = STANDARD_TAGS.map(t => ({
    ...t,
    found: tagsFoundSet.has(t.tag),
  }));

  return { buffer: outputBuffer, tagsFound };
}

// ─── Upload para Supabase Storage ────────────────────────────────────────────

async function uploadToStorage(
  userId: string,
  tenantId: string,
  filename: string,
  buffer: ArrayBuffer | Uint8Array,
  suffix: 'original' | 'prepared'
): Promise<string> {
  const ext = filename.endsWith('.docx') ? '' : '.docx';
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${tenantId}/${userId}/${Date.now()}_${suffix}_${safeName}${ext}`;

  const { error } = await supabase.storage
    .from('school-templates')
    .upload(path, buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer), {
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      upsert: false,
    });

  if (error) throw new Error(`Falha no upload (${suffix}): ${error.message}`);
  return path;
}

// ─── Busca tenant_id do usuário ───────────────────────────────────────────────

async function getCurrentUserAndTenant(): Promise<{ uid: string; tenantId: string }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Usuário não autenticado.');

  const { data: userRow, error } = await supabase
    .from('users')
    .select('tenant_id')
    .eq('id', user.id)
    .single();

  if (error || !userRow?.tenant_id) throw new Error('Tenant não encontrado.');
  return { uid: user.id, tenantId: userRow.tenant_id };
}

// ─── API pública do serviço ───────────────────────────────────────────────────

/**
 * Fluxo completo: upload → análise IA → injeção de tags → salvar.
 * Retorna o registro criado na tabela school_templates.
 */
export async function prepareTemplate(
  file: File,
  friendlyName: string,
  onProgress?: (step: string, pct: number) => void
): Promise<SchoolTemplate> {
  const report = (step: string, pct: number) => onProgress?.(step, pct);

  // 1. Auth
  report('Verificando autenticação…', 5);
  const { uid, tenantId } = await getCurrentUserAndTenant();

  // 2. Lê arquivo
  report('Lendo arquivo…', 10);
  const arrayBuffer = await file.arrayBuffer();

  // 3. Cria registro inicial "processing"
  report('Criando registro…', 15);
  const { data: record, error: insertErr } = await supabase
    .from('school_templates')
    .insert({
      tenant_id:         tenantId,
      created_by:        uid,
      name:              friendlyName,
      original_filename: file.name,
      status:            'processing',
    })
    .select()
    .single();

  if (insertErr || !record) throw new Error(`Erro ao criar registro: ${insertErr?.message}`);
  const templateId = record.id;

  try {
    // 4. Upload original
    report('Enviando arquivo original…', 25);
    const pathOriginal = await uploadToStorage(uid, tenantId, file.name, arrayBuffer, 'original');

    // 5. Extrai texto
    report('Extraindo texto do documento…', 40);
    const docText = await extractTextFromDocx(arrayBuffer);

    if (docText.trim().length < 30) {
      throw new Error(
        'O documento parece estar vazio ou é uma imagem escaneada. ' +
        'A IA precisa de texto para analisar.'
      );
    }

    // 6. Análise pela IA
    report('Analisando com IA (classificação + tags)…', 55);
    const aiResult = await analyzeWithAI(docText);

    // 7. Injeção de tags no XML
    report('Injetando tags no documento…', 75);
    const { buffer: preparedBuffer, tagsFound } = injectTagsInDocx(arrayBuffer, aiResult.replacements);

    // 8. Upload preparado
    report('Enviando documento preparado…', 85);
    const pathPrepared = await uploadToStorage(
      uid, tenantId,
      file.name.replace('.docx', '_preparado.docx').replace('.doc', '_preparado.docx'),
      preparedBuffer,
      'prepared'
    );

    // 9. Atualiza registro no banco
    report('Salvando metadados…', 95);
    const { data: updated, error: updateErr } = await supabase
      .from('school_templates')
      .update({
        status:                 'ready',
        document_type:          aiResult.documentType,
        ai_confidence:          aiResult.confidence,
        ai_reasoning:           aiResult.reasoning,
        storage_path_original:  pathOriginal,
        storage_path_prepared:  pathPrepared,
        tags_injected:          tagsFound,
        replacements_map:       aiResult.replacements,
      })
      .eq('id', templateId)
      .select()
      .single();

    if (updateErr) throw new Error(`Erro ao salvar metadados: ${updateErr.message}`);

    report('Concluído!', 100);
    return mapDbToTemplate(updated);

  } catch (err: any) {
    // Marca como erro no banco
    await supabase
      .from('school_templates')
      .update({ status: 'error', error_message: err?.message ?? String(err) })
      .eq('id', templateId);
    throw err;
  }
}

/**
 * Lista todos os modelos do tenant atual.
 * Se docType informado, filtra por tipo de documento.
 */
export async function listTemplates(docType?: TemplateDocType): Promise<SchoolTemplate[]> {
  const { uid, tenantId } = await getCurrentUserAndTenant();
  void uid;

  let query = supabase
    .from('school_templates')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (docType) query = query.eq('document_type', docType);

  const { data, error } = await query;
  if (error) throw new Error(`Erro ao listar modelos: ${error.message}`);
  return (data ?? []).map(mapDbToTemplate);
}

/**
 * Gera URL assinada (24h) para download do arquivo preparado.
 */
export async function getDownloadUrl(template: SchoolTemplate): Promise<string> {
  const path = template.storagePathPrepared ?? template.storagePathOriginal;
  if (!path) throw new Error('Nenhum arquivo disponível para download.');

  const { data, error } = await supabase.storage
    .from('school-templates')
    .createSignedUrl(path, 60 * 60 * 24); // 24 horas

  if (error || !data?.signedUrl) throw new Error('Erro ao gerar link de download.');
  return data.signedUrl;
}

/**
 * Exclui um modelo (soft delete via is_active = false).
 */
export async function deleteTemplate(templateId: string): Promise<void> {
  const { error } = await supabase
    .from('school_templates')
    .update({ is_active: false })
    .eq('id', templateId);
  if (error) throw new Error(`Erro ao excluir modelo: ${error.message}`);
}

// ─── Mapper DB → frontend ─────────────────────────────────────────────────────

function mapDbToTemplate(row: any): SchoolTemplate {
  return {
    id:                    row.id,
    tenantId:              row.tenant_id,
    createdBy:             row.created_by,
    name:                  row.name,
    originalFilename:      row.original_filename,
    description:           row.description,
    documentType:          row.document_type as TemplateDocType | undefined,
    aiConfidence:          row.ai_confidence,
    aiReasoning:           row.ai_reasoning,
    status:                row.status,
    errorMessage:          row.error_message,
    storagePathOriginal:   row.storage_path_original,
    storagePathPrepared:   row.storage_path_prepared,
    tagsInjected:          Array.isArray(row.tags_injected) ? row.tags_injected : [],
    replacementsMap:       Array.isArray(row.replacements_map) ? row.replacements_map : [],
    isActive:              row.is_active ?? true,
    timesUsed:             row.times_used ?? 0,
    createdAt:             row.created_at,
    updatedAt:             row.updated_at,
  };
}
