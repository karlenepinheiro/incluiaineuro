/**
 * aiService.ts — Serviço de IA do IncluiAI (Sub-etapa 2A)
 *
 * Mudanças da 2A (não afetam assinaturas públicas):
 *   - Cada callAIGateway recebe creditsRequired e requestType
 *   - Guard anti-double-debit: se o servidor retornou creditsRemaining,
 *     o frontend PULA a chamada a deductCredits para aquela operação.
 *     O método deductCredits continua existindo — será removido na 2B.
 *   - analyzeDocument: deductCredits movido para APÓS a chamada à IA (correção de bug)
 *
 * Assinaturas públicas: INALTERADAS.
 */

import { supabase }    from './supabase';
import {
  User, DocumentType, Student, DocumentAnalysis,
  AIModelConfig, AIModelContext, AIOutputType,
  AtividadeJSON, validateAtividadeJSON,
  PRIOR_KNOWLEDGE_LABELS,
  AIResultStatus, AIProtocolResult,
} from '../types';
import { AI_CREDIT_COSTS, INCLUILAB_MODEL_COSTS, CREDIT_INSUFFICIENT_MSG } from '../config/aiCosts';
import { AiAuditService } from './persistenceService';
import type { StudentContext } from './studentContextService';
import { StudentContextService } from './studentContextService';
import { callAIGateway } from './aiGatewayService';
import { CreditTransactionService } from './creditService';
import { clampPromptContext, logPromptBudget } from '../utils/promptBudget';
import {
  CanonicalStudentContextService,
  mapDocTypeToCategory,
  buildDocumentChainBlock,
  buildActivitiesHistoryBlock,
  buildStrategiesBlock,
  type CanonicalStudentContext,
} from './canonicalStudentContext';

/**
 * Orçamento de caracteres para o BLOCO DE CONTEXTO dos prompts montados no
 * cliente (Plano Regente, Perfil Inteligente). O restante do prompt
 * (instrução + dados cadastrais + esqueleto JSON) fica em ~16k; o Gateway
 * rejeita acima de 32k. 15k de contexto deixa folga segura. (auditoria M-08)
 */
const PROMPT_CONTEXT_BUDGET = 15_000;

// @ts-ignore
import * as mammoth from 'mammoth';

// ─── Limpeza de JSON ──────────────────────────────────────────────────────────

export function cleanJsonString(raw: string): string {
  let s = raw.trim().replace(/\uFEFF/g, '');
  const start  = s.indexOf('{');
  const startA = s.indexOf('[');
  if (start !== -1 || startA !== -1) {
    const first = Math.min(start >= 0 ? start : Infinity, startA >= 0 ? startA : Infinity);
    const last  = Math.max(s.lastIndexOf('}'), s.lastIndexOf(']'));
    if (last > first) s = s.substring(first, last + 1);
    else              s = s.substring(first);
  }
  return s;
}

// ─── Pré-processamento de DOCX ────────────────────────────────────────────────

async function extractDocxIfNeeded(
  fileBase64: string | undefined,
): Promise<{ promptAppend: string; imageBase64?: string }> {
  if (!fileBase64) return { promptAppend: '' };

  const mimeMatch = fileBase64.match(/^data:([^;]+);base64,/);
  const mimeType  = mimeMatch?.[1] || '';

  if (
    mimeType.includes('wordprocessingml') ||
    mimeType.includes('officedocument.wordprocessingml.document')
  ) {
    try {
      const b64 = fileBase64.includes(',') ? fileBase64.split(',')[1] : fileBase64;
      const bin = atob(b64);
      const buf = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
      const res  = await mammoth.extractRawText({ arrayBuffer: buf.buffer });
      const text = res.value?.trim() || '';
      if (!text) throw new Error('Documento vazio');
      return { promptAppend: `\n\n[CONTEÚDO DO DOCUMENTO ANEXADO]:\n${text}` };
    } catch (e) {
      console.error('[aiService] Falha ao ler DOCX:', e);
      throw new Error('Não foi possível ler o documento Word. O arquivo pode estar corrompido.');
    }
  }

  return { promptAppend: '', imageBase64: fileBase64 };
}

// ─── Erros amigáveis ──────────────────────────────────────────────────────────

export function friendlyAIError(e: unknown): string {
  const raw = (e instanceof Error ? e.message : String(e)) || '';
  if (raw.includes('CONFIG_GEMINI') || raw.includes('CONFIG_OPENAI'))
    return 'O serviço de inteligência artificial não está configurado. Entre em contato com o suporte.';
  if (raw.includes('CONFIG_VERTEX_IMAGE') || raw.includes('CONFIG_IMAGE'))
    return 'Este modo de geração visual ainda não está configurado no ambiente.';
  if (raw.includes('Créditos insuficientes') || raw.includes('INSUFFICIENT_CREDITS'))
    return raw.includes('Saldo atual') ? raw : 'Créditos insuficientes para esta operação.';
  if (raw.includes('AUTH_ERROR:'))
    return 'Sessão expirada. Faça login novamente.';
  if (raw.includes('DATA_ERROR:'))
    return raw.replace('DATA_ERROR:', '').trim();
  if (raw.includes('Failed to fetch') || raw.includes('NetworkError') || (e as any)?.name === 'TypeError' || raw.includes('Sem conexão'))
    return 'Falha de conexão com o serviço de IA. Verifique sua internet e tente novamente.';
  if (raw.includes('quota') || raw.includes('429') || raw.includes('rate limit'))
    return 'Limite de uso da IA atingido. Aguarde alguns instantes e tente novamente.';
  if (raw.includes('Tempo de resposta') || raw.includes('AbortError') || raw.includes('TIMEOUT'))
    return 'A IA demorou demais para responder. Tente novamente.';
  // Mensagem amigável já formatada pelo servidor — exibe diretamente
  if (raw.length > 0 && raw.length < 200 && !raw.includes('Error:') && !raw.includes('at '))
    return raw;
  return 'Ocorreu um erro ao processar sua solicitação. Tente novamente ou contate o suporte.';
}

// ─── Custos de crédito ────────────────────────────────────────────────────────

export const CREDIT_COSTS: Record<string, number> = {
  ESTUDO_DE_CASO:       AI_CREDIT_COSTS.ESTUDO_DE_CASO,
  PEI:                  AI_CREDIT_COSTS.PEI,
  PAEE:                 AI_CREDIT_COSTS.PAEE,
  PDI:                  AI_CREDIT_COSTS.PDI,
  DOCUMENTO_UNIFICADO_PEI_PAEE: AI_CREDIT_COSTS.DOCUMENTO_UNIFICADO_PEI_PAEE,
  [DocumentType.DOCUMENTO_UNIFICADO_PEI_PAEE]: AI_CREDIT_COSTS.DOCUMENTO_UNIFICADO_PEI_PAEE,
  PLANO_ACAO:           AI_CREDIT_COSTS.PLANO_ACAO,
  PLANO_ACAO_AEE:       AI_CREDIT_COSTS.PLANO_ACAO_AEE,
  ATIVIDADE:            AI_CREDIT_COSTS.ATIVIDADE_TEXTO,
  ATIVIDADE_IMAGEM:     AI_CREDIT_COSTS.ATIVIDADE_IMAGEM,
  INCLUILAB_IMAGE:      AI_CREDIT_COSTS.IMAGEM_PREMIUM,
  ANALISE_DOCUMENTO:    AI_CREDIT_COSTS.ANALISE_DOCUMENTO,
  UPLOAD_MODELO:        AI_CREDIT_COSTS.UPLOAD_MODELO,
  OCR:                  AI_CREDIT_COSTS.OCR,
  ADAPTAR_ATIVIDADE:    AI_CREDIT_COSTS.ADAPTAR_ATIVIDADE,
  RELATORIO:            AI_CREDIT_COSTS.RELATORIO_PADRAO,
  EDULEISIA_ADAPTAR:    AI_CREDIT_COSTS.EDULEISIA_ADAPTAR,
  EDULEISIA_IMAGEM:     AI_CREDIT_COSTS.EDULEISIA_IMAGEM,
  NEURODESIGN_REDESIGN: AI_CREDIT_COSTS.NEURODESIGN_REDESIGN,
  NEURODESIGN_IMAGEM:   AI_CREDIT_COSTS.NEURODESIGN_IMAGEM,
  TEMPLATE:             AI_CREDIT_COSTS.TEMPLATE,
  PERFIL_INTELIGENTE:   AI_CREDIT_COSTS.PERFIL_INTELIGENTE,
};

const UNIFIED_MISSING_PEI_MESSAGE =
  'Para gerar o Plano Unificado PAEE + PEI com segurança, é necessário ter um PEI registrado para este estudante.';
const UNIFIED_MISSING_PAEE_MESSAGE =
  'Para gerar o Plano Unificado PAEE + PEI com segurança, é necessário ter um PAEE registrado para este estudante.';
const UNIFIED_MISSING_BOTH_MESSAGE =
  'O Plano Unificado PAEE + PEI integra informações do PEI e do PAEE. Gere ou registre esses documentos antes de usar a geração automática.';
const UNIFIED_SOURCE_CONTEXT_UNAVAILABLE_MESSAGE =
  'Não foi possível verificar os documentos prévios registrados para este estudante. Tente novamente antes de usar a geração automática.';
const PAEE_MISSING_CASE_STUDY_MESSAGE =
  'Para gerar o PAEE com segurança, é necessário ter um Estudo de Caso registrado para este estudante.';
const PEI_MISSING_PAEE_MESSAGE =
  'Para gerar o PEI com segurança, é necessário ter um PAEE registrado para este estudante.';

function hasCanonicalSourceDocument(ctx: CanonicalStudentContext, category: 'estudo_de_caso' | 'pei' | 'paee'): boolean {
  return ctx.savedDocuments.some(doc =>
    doc.category === category &&
    doc.contentSummary.trim()
  );
}

function getFormalSourceGuardMessage(target: 'PAEE' | 'PEI' | 'DOCUMENTO_UNIFICADO_PEI_PAEE', ctx: CanonicalStudentContext | null): string | null {
  if (!ctx) return UNIFIED_SOURCE_CONTEXT_UNAVAILABLE_MESSAGE;
  if (target === 'PAEE') return hasCanonicalSourceDocument(ctx, 'estudo_de_caso') ? null : PAEE_MISSING_CASE_STUDY_MESSAGE;
  if (target === 'PEI') return hasCanonicalSourceDocument(ctx, 'paee') ? null : PEI_MISSING_PAEE_MESSAGE;

  const hasPEI = hasCanonicalSourceDocument(ctx, 'pei');
  const hasPAEE = hasCanonicalSourceDocument(ctx, 'paee');
  if (!hasPEI && !hasPAEE) return UNIFIED_MISSING_BOTH_MESSAGE;
  if (!hasPEI) return UNIFIED_MISSING_PEI_MESSAGE;
  if (!hasPAEE) return UNIFIED_MISSING_PAEE_MESSAGE;
  return null;
}

// ─── Modelos de IA ────────────────────────────────────────────────────────────

export interface AIProvider {
  generateText(prompt: string, imageBase64?: string): Promise<string>;
  generateJSON(prompt: string): Promise<string>;
  generateImage(prompt: string): Promise<string>;
}

export interface ActivityGenOptions {
  bnccCodes?: string[];
  discipline?: string;
  grade?: string;
  period?: string;
  teacherActivity?: boolean;
  imageBase64?: string;
  modelId?: string;
}

export interface ActivityImageOptions {
  bnccCodes?: string[];
  discipline?: string;
  grade?: string;
  period?: string;
}

export const AI_MODEL_CONFIGS: AIModelConfig[] = [
  {
    id: 'economico', name: 'Econômico', provider: 'gemini', output_type: 'text',
    credit_cost: AI_CREDIT_COSTS.RELATORIO_ECONOMICO, active: true,
    allowed_contexts: ['reports'], description: 'Somente texto, custo mínimo',
  },
  {
    id: 'padrao', name: 'Padrão', provider: 'gemini', output_type: 'text',
    credit_cost: AI_CREDIT_COSTS.RELATORIO_PADRAO, active: true,
    allowed_contexts: ['reports', 'protocols'], description: 'Qualidade balanceada (recomendado)',
  },
  {
    id: 'premium', name: 'Premium', provider: 'gemini', output_type: 'text',
    credit_cost: AI_CREDIT_COSTS.RELATORIO_PREMIUM, active: true,
    allowed_contexts: ['reports'], description: 'Máxima qualidade e riqueza de detalhes',
    warning: `Consome ${AI_CREDIT_COSTS.RELATORIO_PREMIUM} créditos por geração`,
  },
  {
    id: 'texto_apenas', name: 'Texto apenas', provider: 'gemini', output_type: 'text',
    credit_cost: INCLUILAB_MODEL_COSTS.TEXT, active: true,
    allowed_contexts: ['activities', 'incluilab'], description: 'Geração exclusiva de texto pedagógico',
  },
  {
    id: 'nano_banana_pro', name: 'Imagen 4.0', provider: 'gemini', output_type: 'text_image',
    credit_cost: INCLUILAB_MODEL_COSTS.GPT_IMAGE, active: true,
    allowed_contexts: ['activities', 'incluilab'],
    description: 'Texto + imagem pedagógica (Imagen 4.0 · Google)',
    warning: `Consome ${INCLUILAB_MODEL_COSTS.GPT_IMAGE} créditos por geração`,
  },
  {
    id: 'chatgpt_imagem', name: 'ChatGPT Imagem', provider: 'openai', output_type: 'text_image',
    credit_cost: INCLUILAB_MODEL_COSTS.GPT_IMAGE, active: false,
    allowed_contexts: ['activities', 'incluilab'], description: 'Texto + imagem (desativado)',
  },
];

export function getModelConfig(id: string): AIModelConfig {
  return AI_MODEL_CONFIGS.find((m) => m.id === id) ?? AI_MODEL_CONFIGS.find((m) => m.id === 'padrao')!;
}

export function getModelsForContext(context: AIModelContext): AIModelConfig[] {
  return AI_MODEL_CONFIGS.filter((m) => m.active && m.allowed_contexts.includes(context));
}

export function modelGeneratesImage(id: string): boolean {
  return getModelConfig(id).output_type === 'text_image';
}

function insufficientCreditsError(_req?: number, _bal?: number, _action?: string): Error {
  return new Error(CREDIT_INSUFFICIENT_MSG);
}

// Bloco de contexto familiar registrado — não interpreta por diagnóstico
function buildFamilyBlock(student: Student): string {
  const lines: string[] = [];
  if (student.familyContext?.trim()) {
    lines.push(`Contexto familiar relatado: ${student.familyContext.trim()}`);
  }
  if (student.guardianName?.trim()) {
    lines.push(`Responsável legal: ${student.guardianName.trim()}`);
  }
  if ((student as any).guardianRelationship?.trim()) {
    lines.push(`Vínculo: ${(student as any).guardianRelationship}`);
  }
  if (lines.length === 0) return '';
  return `\nCONTEXTO FAMILIAR REGISTRADO (use apenas as informações explicitamente registradas; não deduza pelo diagnóstico):\n${lines.join('\n')}\nINSTRUÇÃO: Use estes dados somente como relato/contexto registrado. Não transforme fala da família em conclusão clínica, diagnóstico, dificuldade presumida ou histórico não documentado.\n`;
}

// Formata o bloco de conhecimento prévio do aluno para injeção nos prompts de atividade
function buildPKBlock(student: Student): string {
  const pk = student.priorKnowledge;
  if (!pk) return '';
  const dims = [
    { key: 'leitura',      label: 'Leitura' },
    { key: 'escrita',      label: 'Escrita' },
    { key: 'entendimento', label: 'Compreensão' },
    { key: 'autonomia',    label: 'Autonomia' },
    { key: 'atencao',      label: 'Atenção' },
    { key: 'raciocinio',   label: 'Raciocínio lógico-matemático' },
  ] as const;
  const lines: string[] = [];
  for (const dim of dims) {
    const score = (pk as any)[`${dim.key}_score`] as number | undefined;
    const notes = (pk as any)[`${dim.key}_notes`] as string | undefined;
    if (score) {
      const lbl = PRIOR_KNOWLEDGE_LABELS[score as 1|2|3|4|5] ?? String(score);
      lines.push(`  - ${dim.label}: ${score}/5 (${lbl})${notes ? ` — ${notes}` : ''}`);
    }
  }
  if (lines.length === 0) return '';
  const header = '\nPERFIL PEDAGÓGICO INICIAL DO ALUNO (use para calibrar nível, linguagem e complexidade):';
  const obs = pk.observacoes_pedagogicas
    ? `\n  Observações pedagógicas: ${pk.observacoes_pedagogicas}` : '';
  return `${header}\n${lines.join('\n')}${obs}\n`;
}

// ─── Guardrails Globais de IA ─────────────────────────────────────────────────

/**
 * Bloco de guardrails éticos padronizados.
 * Injetar em prompts que não têm seção própria de "ORIENTAÇÕES ÉTICAS DA IA"
 * (ex: generateProtocol legado, analyzeDocument, analyzeUploadedDocument).
 */
export const GLOBAL_AI_GUARDRAILS = `GUARDRAILS ÉTICOS E DE SEGURANÇA — OBRIGATÓRIOS:
1. NUNCA inventar diagnóstico, CID, condição clínica ou laudo não registrado no sistema.
2. NUNCA criar ou inferir CID — usar somente os fornecidos explicitamente.
3. NUNCA afirmar ter analisado arquivo cujo conteúdo textual não foi extraído.
4. Distinguir: laudo clínico (profissional de saúde) ≠ observação pedagógica (professor/AEE) ≠ registro de rotina escolar (cuidadora). Nunca elevar observação pedagógica a diagnóstico.
5. NUNCA prescrever medicamento, terapia ou conduta médica.
6. NUNCA usar linguagem de perícia médica fora de contexto pedagógico.
7. Dado essencial ausente → "Não há registro no sistema sobre..." — jamais inventar.
8. Usar "com base nos registros disponíveis" somente quando houver dado real correspondente.
9. Sinalizar lacunas: "Recomenda-se complementar com observação da equipe escolar/família."
TERMOS PROIBIDOS — nunca gere: "CID provável", "diagnóstico provável", "diagnóstico compatível com", "certamente apresenta", "provavelmente possui", "tratamento medicamentoso", "prescrição de", "terapia obrigatória", "laudo confirma" sem fonte registrada.`;

/**
 * Bloco curto de termos proibidos.
 * Injetar no fim de seções "ORIENTAÇÕES ÉTICAS DA IA" já existentes, para
 * padronizar linguagem de incerteza sem duplicar regras completas.
 */
export const FORBIDDEN_TERMS_BLOCK = `- Termos proibidos — nunca gere: "CID provável", "diagnóstico provável", "certamente apresenta", "provavelmente possui", "tratamento medicamentoso", "prescrição de", "terapia obrigatória".
- Dado essencial ausente → "Não há registro no sistema sobre..." ou "A informação não foi localizada nos documentos disponíveis. Recomenda-se complementar com a equipe escolar/família."`;

// ─── Serviço principal ────────────────────────────────────────────────────────

export const AIService = {

  async getRemainingCredits(user: User): Promise<number> {
    if (!user?.tenant_id) return -1;
    try {
      const { data, error } = await supabase
        .from('credits_wallet').select('balance')
        .eq('tenant_id', user.tenant_id).maybeSingle();
      if (error) return -1;
      const val = Number((data as any)?.balance ?? -1);
      return Number.isFinite(val) ? val : -1;
    } catch { return -1; }
  },

  async checkCredits(user: User, cost: number = 1): Promise<boolean> {
    if (!user?.tenant_id) return true;
    try {
      const { data, error } = await supabase
        .from('credits_wallet').select('balance')
        .eq('tenant_id', (user as any).tenant_id).maybeSingle();
      if (error) { console.warn('[AIService] credit check error:', error.message); return true; }
      if (!data) return true;
      const remaining = Number((data as any)?.balance ?? 0);
      return Number.isNaN(remaining) ? true : remaining >= cost;
    } catch { return true; }
  },

  async getCreditsBalance(user: User): Promise<number> {
    if (!user?.tenant_id) return 0;
    try {
      const { data } = await supabase
        .from('credits_wallet').select('balance')
        .eq('tenant_id', (user as any).tenant_id).maybeSingle();
      return Number((data as any)?.balance ?? 0);
    } catch { return 0; }
  },

  // Mantido intacto para a 2A — será removido na 2B
  async deductCredits(user: User, action: string | number, cost?: number, operationId?: string): Promise<void> {
    if (!user?.tenant_id) return;
    const resolvedAction = typeof action === 'string' ? action : 'IA';
    const resolvedCost = typeof action === 'number' ? action : Number(cost ?? 0);
    if (!(resolvedCost > 0)) return;
    try {
      const tenantId = (user as any).tenant_id;
      const userId = (user as any).id ?? null;

      await CreditTransactionService.atomicDebitCredits({
        tenantId,
        amount: resolvedCost,
        description: `IA: ${resolvedAction}`,
        userId,
        operationId: operationId ?? CreditTransactionService.createOperationId(`ai_debit:${String(resolvedAction).toLowerCase()}`),
        metadata: {
          action: resolvedAction,
          requested_by: 'AIService.deductCredits',
        },
        source: 'ai_service.deductCredits',
      });
    } catch (e) {
      console.warn('[AIService] deductCredits unexpected error:', e);
    }
  },

  // ── Protocolos ──────────────────────────────────────────────────────────────

  async generateProtocol(type: any, student: Student, user: User, laudo?: string): Promise<string> {
    const cost = CREDIT_COSTS[type] || 1;
    if (!(await this.checkCredits(user, cost))) {
      throw insufficientCreditsError(cost, await this.getCreditsBalance(user));
    }

    const { promptAppend, imageBase64 } = await extractDocxIfNeeded(laudo);
    const prompt = `Gere o protocolo ${type} para ${student.name}. Diagnóstico: ${student.diagnosis.join(', ')}. Nível de suporte: ${student.supportLevel}.${promptAppend}

${GLOBAL_AI_GUARDRAILS}`;

    const { result, creditsRemaining } = await callAIGateway({
      task: 'text', prompt, imageBase64,
      creditsRequired: cost,
      requestType: String(type).toLowerCase(),
    });

    // Guard anti-double-debit (2A): se servidor debitou, pula debit local
    if (creditsRemaining === undefined) {
      await this.deductCredits(user, type, cost);
    }
    return result;
  },

  async generateProtocolJSON(type: any, student: Student, user: User, studentContext?: StudentContext): Promise<AIProtocolResult> {
    const cost = CREDIT_COSTS[type] || 1;
    if (!(await this.checkCredits(user, cost))) {
      throw insufficientCreditsError(cost, await this.getCreditsBalance(user));
    }

    const auditId = await AiAuditService.logRequest({
      tenantId: (user as any).tenant_id ?? '', userId: user.id,
      requestType: `protocol_${String(type).toLowerCase()}`,
      model: 'gemini-2.5-flash', creditsConsumed: cost,
      inputData: { studentId: student.id, studentName: student.name, docType: type },
    });
    const t0 = Date.now();

    const docLabel     = String(type);
    const missingData  = 'não há registro nos dados disponíveis';
    const diagnosis    = (student.diagnosis || []).join(', ') || missingData;
    const cid          = Array.isArray(student.cid) ? student.cid.join(', ') : (student.cid || 'Não informado');
    const abilities    = (student.abilities || []).join('; ') || 'Não informado';
    const difficulties = (student.difficulties || []).join('; ') || 'Não informado';
    const strategies   = (student.strategies || []).join('; ') || 'Não informado';

    // Sprint IA-9: contexto canônico delegado à Edge (buildContextServer=true).
    // Mantemos canonicalCtx SOMENTE para validateAndRepair pós-geração (sem custo de prompt).
    // A Edge injeta o contexto via service_role (valida tenant, sem dados no HTTP request).
    let canonicalCtx: CanonicalStudentContext | null = null;
    try {
      canonicalCtx = await CanonicalStudentContextService.buildCanonicalContext(student);
    } catch { /* validação pós-geração é opcional */ }

    const studentDataBlock = `Dados cadastrais do aluno:
- Nome do aluno: ${student.name}
- Responsável legal: ${student.guardianName || '—'}
- Telefone do responsável: ${student.guardianPhone || '—'}
- Diagnóstico(s): ${diagnosis}
- CID: ${cid}
- Nível de Suporte: ${student.supportLevel || 'Não informado'}
- Habilidades: ${abilities}
- Dificuldades: ${difficulties}
- Estratégias eficazes: ${strategies}
- Série/Turno: ${student.grade || '—'} / ${student.shift || '—'}
- Professor Regente: ${student.regentTeacher || '—'}
- Professor AEE: ${student.aeeTeacher || '—'}
- Coordenação: ${(student as any).coordinator || '—'}
- Contexto familiar: ${student.familyContext || 'Não informado'}
- Histórico escolar: ${student.schoolHistory || 'Não informado'}

IMPORTANTE: "Nome do aluno" refere-se APENAS ao estudante. "Responsável legal" é o adulto guardião. Nunca confunda essas identidades.`;

    const typeUpper      = String(type).toUpperCase().replace(/\s+/g, '_');
    const isPEI          = typeUpper.includes('PEI') && !typeUpper.includes('PLANO');
    const isEstudoCaso   = typeUpper.includes('ESTUDO');
    const isPAEE         = typeUpper.includes('PAEE');
    const isPDI          = typeUpper.includes('PDI') && !typeUpper.includes('PLANO');
    const isPlanoAcaoAEE = typeUpper.includes('PLANO_ACAO') || typeUpper.includes('PLANO_DE_ACAO');
    const isDocumentoUnificadoPeiPaee =
      typeUpper.includes('DOCUMENTO_UNIFICADO_PEI_PAEE') ||
      (typeUpper.includes('UNIFICADO') && typeUpper.includes('PEI') && typeUpper.includes('PAEE'));

    const formalSourceGuardTarget = isDocumentoUnificadoPeiPaee
      ? 'DOCUMENTO_UNIFICADO_PEI_PAEE'
      : isPAEE
        ? 'PAEE'
        : isPEI
          ? 'PEI'
          : null;

    if (formalSourceGuardTarget) {
      const sourceGuardMessage = getFormalSourceGuardMessage(formalSourceGuardTarget, canonicalCtx);
      if (sourceGuardMessage) {
        if (auditId) {
          AiAuditService.completeRequest(auditId, {
            status: 'failed',
            latencyMs: Date.now() - t0,
            outputType: 'json',
            content: 'missing_required_formal_sources',
          });
        }
        throw new Error(sourceGuardMessage);
      }
    }

    const familyBlock = buildFamilyBlock(student);

    const formalDocumentGuardrails = `REGRAS DE OBJETIVIDADE, EVIDÊNCIA E ANTIRREPETIÇÃO:
- Preencha apenas campos com dados suficientes nos dados cadastrais, contexto canônico, observações, laudos, fichas, documentos salvos ou registros pedagógicos.
- Quando não houver evidência para um campo, use string vazia ou "Não informado nos dados disponíveis", conforme fizer mais sentido para leitura do documento.
- Não invente dados, não deduza clinicamente e não transforme observação pedagógica em diagnóstico.
- Não repita a mesma informação em campos diferentes. Se uma evidência já foi usada em uma seção, nas próximas seções apenas complemente com informação nova.
- Não atribua automaticamente comportamentos, barreiras ou dificuldades apenas pelo diagnóstico. Use diagnóstico como contexto, mas priorize registros pedagógicos, observações, fichas, laudos e informações efetivamente disponíveis.
- Use linguagem técnica, objetiva, pedagógica, com frases curtas. Evite juridiquês excessivo e não repita legislação em campos pedagógicos.
- A base legal deve aparecer apenas no campo/bloco legal quando existir; fora dele, cite normas somente se for indispensável.`;

    let prompt: string;

    // ── Documento Unificado PEI + PAEE ─────────────────────────────────────────
    if (isDocumentoUnificadoPeiPaee) {
      prompt = `Você é especialista em educação inclusiva e documentação pedagógica institucional.

FINALIDADE DO DOCUMENTO: Gerar o Plano Unificado PAEE + PEI, documento formal de síntese articulada entre Estudo de Caso, PEI e PAEE. Ele integra, em um único instrumento, planejamento do AEE, acessibilidade, apoios, objetivos pedagógicos e acessibilidade curricular. Não substitui os documentos separados PEI e PAEE; organiza a articulação entre eles para orientar a equipe escolar.

FONTES PRIORITÁRIAS OBRIGATÓRIAS:
- Estudo de Caso.
- PEI.
- PAEE.

REGRA DE FONTE DO PLANO UNIFICADO:
- Este documento NÃO é relatório genérico e NÃO deve nascer apenas de dados cadastrais.
- Use prioritariamente Estudo de Caso + PEI + PAEE, nessa ordem de articulação: Estudo de Caso como base interpretativa, PEI como fonte curricular/pedagógica e PAEE como fonte de acessibilidade/AEE.
- Se alguma fonte estiver incompleta no contexto, declare o limite no campo correspondente e não preencha com suposições.
- PEI e PAEE são pré-requisitos da geração automática. Se o contexto indicar ausência de um deles, não invente integração; registre a lacuna de forma objetiva.

FONTES SECUNDÁRIAS PERMITIDAS:
- Ficha do aluno e dados familiares registrados.
- Ficha cognitiva, registros pedagógicos, checklists e observações.
- Laudos/documentos analisados, apenas como fonte registrada e sem transformar este documento em laudo.
- Monitoramento/evolução somente quando houver registros temporais comparáveis.

FONTES QUE NÃO PODEM SER BASE PRINCIPAL:
- Diagnóstico/CID isolado.
- Perfil Inteligente como verdade única.
- Plano de Ação AEE ou Plano do Regente.
- Atividades geradas.
- Documentos não validados ou sem conteúdo recuperável.

REGRA CENTRAL:
Sintetizar, não copiar. Integrar, não repetir. Orientar, não diagnosticar.

VOZ DOCUMENTAL:
- Escreva como equipe pedagógica especializada: técnica, humana, orientadora, institucional e segura.
- Evite texto frio, robótico ou genérico; cada recomendação deve ter relação clara com Estudo de Caso, PEI, PAEE ou dado pedagógico registrado.
- Prefira formulações como "Considerando os registros do Estudo de Caso, do PEI e do PAEE...", "A articulação entre sala comum e AEE deverá priorizar..." e "O acompanhamento deverá observar evidências como...".
- Não use juridiquês excessivo e não repita "O aluno apresenta" em sequência.

BNCC E ACESSIBILIDADE CURRICULAR:
- Quando houver habilidades BNCC no PEI/PAEE, crie um bloco claro chamado "BNCC e acessibilidade curricular".
- Para cada habilidade ou grupo de habilidades, apresente: Código BNCC; foco pedagógico; justificativa pedagógica; adaptação necessária; ação na sala comum; ação no AEE; evidência esperada.
- Explique por que a habilidade foi considerada, como ela se conecta às necessidades do estudante e quais estratégias derivam dela.
- Se não houver BNCC no PEI/PAEE, não invente códigos. Use exatamente: "Não foram identificadas habilidades BNCC vinculadas nos documentos de origem. Recomenda-se revisar o PEI/PAEE para registrar as habilidades prioritárias."

REGRAS OBRIGATÓRIAS:
- Documento enxuto: preferência de 2 laudas, máximo aceitável de 3 laudas.
- Não criar sumário executivo, fundamentação legal extensa ou introdução longa.
- Não copiar integralmente Estudo de Caso, PEI ou PAEE.
- Não repetir a mesma informação em vários blocos.
- Não inventar diagnóstico, CID, medicação, terapia, frequência, evolução, acompanhamento externo ou histórico familiar.
- Diagnóstico/CID é dado cadastral e não pode deduzir comportamento, autonomia, suporte, dificuldade ou estratégia.
- Se faltar dado, use "não há registro nos dados disponíveis" ou campo vazio, conforme o schema.
- Não afirmar evolução, avanço, regressão ou manutenção sem registros temporais comparáveis.
- Não criar parecer clínico.
- Não prescrever terapia, medicação ou conduta médica.
- Não afirmar incapacidade.
- Não transformar PAEE em PEI.
- Não transformar PEI em PAEE.
- BNCC/habilidades só devem aparecer quando houver habilidade confiável registrada no PEI/PAEE ou nos documentos de origem. Nunca invente código BNCC.

${studentDataBlock}
${familyBlock}

RETORNE SOMENTE JSON válido compatível com o DocumentBuilder. Preserve exatamente a estrutura sections -> fields -> value.
Os campos "value" devem conter texto final, curto e institucional, nunca instruções ou placeholders.

{
  "sections": [
    {
      "id": "identificacao_estudo",
      "title": "Identificação e Estudo de Caso resumido",
      "fields": [
        { "id": "identificacao_escolar", "label": "Identificação escolar do estudante", "type": "textarea", "value": "${student.name} — ${student.schoolName || 'não há registro nos dados disponíveis'} — ${student.grade || 'não há registro nos dados disponíveis'} — ${student.shift || 'não há registro nos dados disponíveis'}" },
        { "id": "periodo_vigencia", "label": "Período de vigência", "type": "text", "value": "Ano letivo ${new Date().getFullYear()}" },
        { "id": "sintese_estudo_caso", "label": "Síntese do Estudo de Caso", "type": "textarea", "value": "" },
        { "id": "potencialidades", "label": "Potencialidades principais", "type": "textarea", "value": "" },
        { "id": "necessidades_educacionais", "label": "Necessidades educacionais prioritárias", "type": "textarea", "value": "" }
      ]
    },
    {
      "id": "apoios_paee",
      "title": "Definição de apoios — foco PAEE",
      "fields": [
        { "id": "barreiras_prioritarias", "label": "Barreiras prioritárias", "type": "textarea", "value": "" },
        { "id": "apoios_necessarios", "label": "Apoios necessários", "type": "textarea", "value": "" },
        { "id": "recursos_acessibilidade", "label": "Recursos de acessibilidade", "type": "textarea", "value": "" },
        { "id": "foco_atendimento_aee", "label": "Foco do atendimento AEE", "type": "textarea", "value": "" }
      ]
    },
    {
      "id": "acessibilidade_curricular",
      "title": "BNCC e acessibilidade curricular",
      "fields": [
        { "id": "objetivos_pedagogicos", "label": "Objetivos pedagógicos prioritários", "type": "textarea", "value": "" },
        { "id": "adaptacoes_curriculares", "label": "Adaptações curriculares e metodológicas", "type": "textarea", "value": "" },
        { "id": "estrategias_avaliacao", "label": "Estratégias de avaliação", "type": "textarea", "value": "" },
        { "id": "bncc_habilidades", "label": "BNCC e acessibilidade curricular contextualizada", "type": "textarea", "value": "" }
      ]
    },
    {
      "id": "articulacao",
      "title": "Articulação AEE e classe comum",
      "fields": [
        { "id": "responsabilidades_aee", "label": "Responsabilidades do AEE", "type": "textarea", "value": "" },
        { "id": "responsabilidades_regente", "label": "Responsabilidades do professor regente", "type": "textarea", "value": "" },
        { "id": "comunicacao_aee_sala", "label": "Comunicação entre AEE e sala comum", "type": "textarea", "value": "" },
        { "id": "registro_acompanhamento", "label": "Registro e acompanhamento", "type": "textarea", "value": "" }
      ]
    },
    {
      "id": "monitoramento_familia",
      "title": "Monitoramento e família",
      "fields": [
        { "id": "indicadores_observaveis", "label": "Indicadores observáveis", "type": "textarea", "value": "" },
        { "id": "periodicidade_revisao", "label": "Periodicidade de revisão", "type": "text", "value": "" },
        { "id": "participacao_familia", "label": "Participação e comunicação com a família", "type": "textarea", "value": "" },
        { "id": "proxima_revisao", "label": "Próxima revisão", "type": "text", "value": "" },
        { "id": "fechamento", "label": "Fechamento institucional", "type": "textarea", "value": "" }
      ]
    }
  ]
}

LIMITES DE CONTEÚDO:
- Síntese do Estudo de Caso: até 2 parágrafos curtos.
- Potencialidades: até 3.
- Necessidades educacionais: até 3.
- Barreiras: até 3.
- Apoios: até 3.
- Recursos: até 3.
- Objetivos pedagógicos: até 3.
- Adaptações: até 4.
- Estratégias de avaliação: até 3.
- Responsabilidades do AEE: até 3.
- Responsabilidades do regente: até 3.
- Indicadores de acompanhamento: até 3.
- Fechamento: 1 parágrafo curto.

Preencha somente com dados sustentados pelas fontes disponíveis. Se Estudo de Caso, PAEE ou PEI estiverem ausentes, reconheça a lacuna no campo pertinente sem inventar conteúdo. Português brasileiro formal e JSON válido.`;

    // ── PEI ─────────────────────────────────────────────────────────────────────
    } else if (isPEI) {
      prompt = `Você é psicopedagogo especialista em Plano Educacional Individualizado (PEI) conforme a Lei Brasileira de Inclusão (Lei 13.146/2015) e a PNEEPEI.

FINALIDADE DO PEI: Instrumento que orienta o PROFESSOR DA SALA COMUM. Traduz o diagnóstico em metas anuais mensuráveis por disciplina/BNCC, com estratégias adaptadas ao perfil real do aluno e critérios observáveis de avaliação. Não é relatório — é plano de ação para o cotidiano da sala regular.

ORIENTAÇÕES ÉTICAS DA IA:
- Melhore linguagem, conectivos, gramática e vocabulário técnico — NÃO crie fatos.
- A fala dos responsáveis deve ser interpretada com critério; jamais seja transcrita como verdade absoluta.
- Não invente diagnósticos, laudos, habilidades ou histórico não fornecido.
- Se um dado estiver ausente, deixe o campo vazio ou infira APENAS a partir de dados explicitamente fornecidos.
- Ao citar legislação, use apenas as normas pelo nome geral — nunca invente artigo, inciso ou resolução específica. Normas seguras: Lei nº 13.146/2015 (LBI), Lei nº 9.394/1996 (LDB), PNEEPEI, BNCC, Resolução CNE/CEB nº 4/2009.
${FORBIDDEN_TERMS_BLOCK}

${studentDataBlock}
${familyBlock}

${formalDocumentGuardrails}

REGRAS DE GERAÇÃO — aplique a cada campo:
1. Cada objetivo deve ser SMART: específico, mensurável, atingível, relevante e com prazo anual implícito.
2. Habilidades BNCC: cite os códigos reais da BNCC adequados ao ano/série e ao nível de desenvolvimento do aluno.
3. Estratégias: cite recursos concretos ligados às evidências disponíveis sobre o aluno; use o diagnóstico apenas como contexto de apoio, nunca como única justificativa.
4. Critérios de avaliação: comportamentos OBSERVÁVEIS (nunca "melhorar" — sempre "identificar", "escrever", "resolver", "completar com apoio").
5. Nunca repita o mesmo texto entre disciplinas. Cada área tem conteúdo diferenciado.
6. Para Ensino Religioso e Educação Física: gere apenas se houver dados suficientes; caso contrário, deixe os campos com string vazia.
7. Linguagem técnica formal, objetiva e em português brasileiro. Use "Não informado nos dados disponíveis" apenas quando a ausência de informação precisar ficar explícita.
8. EVIDÊNCIAS PEDAGÓGICAS: Se o contexto incluir seção "EVIDÊNCIAS PEDAGÓGICAS E DE ROTINA", use-as para embasar estratégias concretas e comportamentos observados. Cite como "conforme observações em sala" ou "segundo registro do professor regente". Nunca transforme observação pedagógica em diagnóstico clínico. Diferencie: laudo clínico (profissional de saúde) ≠ observação pedagógica (professor/AEE) ≠ registro de rotina (cuidadora).

LIMITES DO PEI:
- Objetivos: até 3 objetivos por área, em frases curtas e mensuráveis.
- Estratégias: até 4 estratégias por área.
- Adaptações: até 4 adaptações por campo.
- Critérios de avaliação: até 3 critérios observáveis.
- Sínteses narrativas: até 1 parágrafo de 4 a 6 linhas.
- Evite repetir a mesma justificativa em todas as disciplinas.

RETORNE SOMENTE o JSON válido. Os campos "value" devem conter CONTEÚDO REAL — não instruções nem placeholders:
{
  "sections": [
    {
      "id": "header",
      "title": "Identificação",
      "fields": [
        { "id": "name",    "label": "Nome do Aluno",    "type": "text", "value": "${student.name}" },
        { "id": "diag",    "label": "Diagnóstico / CID","type": "text", "value": "${diagnosis}" },
        { "id": "vigencia","label": "Vigência do PEI",  "type": "text", "value": "Ano letivo ${new Date().getFullYear()}" }
      ]
    },
    {
      "id": "sintese",
      "title": "Estudo de Caso / Síntese-base",
      "fields": [
        { "id": "sint1", "label": "Síntese do histórico relevante", "type": "textarea", "value": "" },
        { "id": "sint2", "label": "Contexto familiar e fatores de suporte", "type": "textarea", "value": "" }
      ]
    },
    {
      "id": "potencial",
      "title": "Potencialidades",
      "fields": [
        { "id": "pot1", "label": "Habilidades, interesses e pontos fortes", "type": "textarea", "value": "" }
      ]
    },
    {
      "id": "necessidades",
      "title": "Necessidades Educacionais e Barreiras",
      "fields": [
        { "id": "nec1", "label": "Principais necessidades educacionais especiais", "type": "textarea", "value": "" }
      ]
    },
    {
      "id": "obj_geral",
      "title": "Objetivo Geral do PEI",
      "fields": [
        { "id": "og1", "label": "Objetivo geral para o ano letivo", "type": "textarea", "value": "" }
      ]
    },
    {
      "id": "portugues",
      "title": "Língua Portuguesa",
      "fields": [
        { "id": "pt_bncc",   "label": "Habilidades BNCC trabalhadas",  "type": "textarea", "value": "" },
        { "id": "pt_obj",    "label": "Objetivos pedagógicos",         "type": "textarea", "value": "" },
        { "id": "pt_estrat", "label": "Estratégias de ensino",         "type": "textarea", "value": "" },
        { "id": "pt_adapt",  "label": "Adaptações curriculares",       "type": "textarea", "value": "" },
        { "id": "pt_aval",   "label": "Critérios de avaliação",        "type": "textarea", "value": "" }
      ]
    },
    {
      "id": "matematica",
      "title": "Matemática",
      "fields": [
        { "id": "mt_bncc",   "label": "Habilidades BNCC trabalhadas",  "type": "textarea", "value": "" },
        { "id": "mt_obj",    "label": "Objetivos pedagógicos",         "type": "textarea", "value": "" },
        { "id": "mt_estrat", "label": "Estratégias de ensino",         "type": "textarea", "value": "" },
        { "id": "mt_adapt",  "label": "Adaptações curriculares",       "type": "textarea", "value": "" },
        { "id": "mt_aval",   "label": "Critérios de avaliação",        "type": "textarea", "value": "" }
      ]
    },
    {
      "id": "ciencias",
      "title": "Ciências",
      "fields": [
        { "id": "ci_bncc",   "label": "Habilidades BNCC trabalhadas",  "type": "textarea", "value": "" },
        { "id": "ci_obj",    "label": "Objetivos pedagógicos",         "type": "textarea", "value": "" },
        { "id": "ci_estrat", "label": "Estratégias de ensino",         "type": "textarea", "value": "" },
        { "id": "ci_adapt",  "label": "Adaptações curriculares",       "type": "textarea", "value": "" },
        { "id": "ci_aval",   "label": "Critérios de avaliação",        "type": "textarea", "value": "" }
      ]
    },
    {
      "id": "historia",
      "title": "História",
      "fields": [
        { "id": "hi_bncc",   "label": "Habilidades BNCC trabalhadas",  "type": "textarea", "value": "" },
        { "id": "hi_obj",    "label": "Objetivos pedagógicos",         "type": "textarea", "value": "" },
        { "id": "hi_estrat", "label": "Estratégias de ensino",         "type": "textarea", "value": "" },
        { "id": "hi_adapt",  "label": "Adaptações curriculares",       "type": "textarea", "value": "" },
        { "id": "hi_aval",   "label": "Critérios de avaliação",        "type": "textarea", "value": "" }
      ]
    },
    {
      "id": "geografia",
      "title": "Geografia",
      "fields": [
        { "id": "ge_bncc",   "label": "Habilidades BNCC trabalhadas",  "type": "textarea", "value": "" },
        { "id": "ge_obj",    "label": "Objetivos pedagógicos",         "type": "textarea", "value": "" },
        { "id": "ge_estrat", "label": "Estratégias de ensino",         "type": "textarea", "value": "" },
        { "id": "ge_adapt",  "label": "Adaptações curriculares",       "type": "textarea", "value": "" },
        { "id": "ge_aval",   "label": "Critérios de avaliação",        "type": "textarea", "value": "" }
      ]
    },
    {
      "id": "ed_religiosa",
      "title": "Ensino Religioso (se aplicável)",
      "fields": [
        { "id": "er_obj",   "label": "Objetivos pedagógicos",    "type": "textarea", "value": "" },
        { "id": "er_adapt", "label": "Adaptações e estratégias", "type": "textarea", "value": "" }
      ]
    },
    {
      "id": "ed_fisica",
      "title": "Educação Física (se aplicável)",
      "fields": [
        { "id": "ef_bncc",  "label": "Habilidades BNCC trabalhadas", "type": "textarea", "value": "" },
        { "id": "ef_obj",   "label": "Objetivos pedagógicos",        "type": "textarea", "value": "" },
        { "id": "ef_adapt", "label": "Adaptações e estratégias",     "type": "textarea", "value": "" }
      ]
    },
    {
      "id": "recursos",
      "title": "Recursos e Acessibilidade",
      "fields": [
        { "id": "rec2", "label": "Adaptações de ambiente e material", "type": "textarea", "value": "" }
      ]
    },
    {
      "id": "comportamento",
      "title": "Comportamento e Autonomia",
      "fields": [
        { "id": "comp1", "label": "Comportamentos observados e estratégias de manejo", "type": "textarea", "value": "" },
        { "id": "comp2", "label": "Metas de autonomia e independência", "type": "textarea", "value": "" }
      ]
    },
    {
      "id": "avaliacao",
      "title": "Avaliação",
      "fields": [
        { "id": "av1", "label": "Formas de avaliação adaptada",   "type": "textarea", "value": "" },
        { "id": "av2", "label": "Instrumentos e periodicidade",   "type": "textarea", "value": "" }
      ]
    },
    {
      "id": "monitoramento",
      "title": "Monitoramento",
      "fields": [
        { "id": "mon1", "label": "Periodicidade de revisão do PEI",  "type": "text",     "value": "Bimestral" },
        { "id": "mon2", "label": "Responsáveis pelo monitoramento",  "type": "text",     "value": "${student.aeeTeacher ? `Prof. AEE: ${student.aeeTeacher}` : 'Professor AEE e Professor Regente'}" },
        { "id": "mon3", "label": "Observações do monitoramento",     "type": "textarea", "value": "" }
      ]
    }
  ]
}

Preencha os campos "value" somente quando houver dados suficientes. Campos sem evidência podem ficar com string vazia ou "Não informado nos dados disponíveis". Mantenha JSON válido e português brasileiro formal.`;

    // ── PAEE ─────────────────────────────────────────────────────────────────────
    } else if (isPAEE) {
      prompt = `Você é especialista em Plano de Atendimento Educacional Especializado (PAEE) conforme a Resolução CNE/CEB nº 4/2009 e a Nota Técnica nº 11/2010 do MEC/SEESP.

FINALIDADE DO PAEE: Instrumento que orienta a PROFESSORA DO AEE / SALA DE RECURSOS. Define os recursos de acessibilidade, adaptações e estratégias de inclusão para que o aluno participe plenamente do ambiente escolar. Foco em COMO o aluno acessa o ambiente e o currículo — não em O QUE aprende (isso é o PEI).

ORIENTAÇÕES ÉTICAS DA IA:
- Melhore linguagem e vocabulário técnico — NÃO crie fatos não fornecidos.
- A fala dos responsáveis deve ser interpretada com critério; jamais transcrita como verdade absoluta.
- Não invente recursos, laudos ou dados ausentes.
- Ao citar legislação, use apenas as normas pelo nome geral — nunca invente artigo, inciso ou resolução específica. Normas seguras: Lei nº 13.146/2015 (LBI), Lei nº 9.394/1996 (LDB), PNEEPEI, Resolução CNE/CEB nº 4/2009, Nota Técnica MEC/SEESP nº 11/2010.
${FORBIDDEN_TERMS_BLOCK}

${studentDataBlock}
${familyBlock}

${formalDocumentGuardrails}

REGRAS DE GERAÇÃO:
1. Distinguir claramente: PAEE é sobre COMO o aluno acessa o ambiente e o currículo — não sobre O QUE ele aprende.
2. Cada adaptação deve especificar: (a) o recurso ou estratégia, (b) a barreira que remove, (c) quem é responsável pela implementação.
3. Tecnologia Assistiva: cite recursos concretos e gratuitos ou acessíveis ao contexto público (ex: CAA, pranchas de comunicação, leitores de tela, materiais em Braille, software de acessibilidade).
4. Não repita o diagnóstico como se fosse limitação — foque nas barreiras ambientais que precisam ser removidas.
5. Inclua adaptações para ambiente físico, comunicação, material didático, avaliação e interação social somente quando houver evidência ou necessidade pedagógica suficiente.
6. Se há perfil cognitivo, laudos ou registros no contexto, use-os de forma objetiva para justificar adaptações; se não houver, não invente.
7. A seção de família deve orientar apenas apoios domiciliares sustentados pelos dados disponíveis.
8. EVIDÊNCIAS PEDAGÓGICAS: Se o contexto incluir seção "EVIDÊNCIAS PEDAGÓGICAS E DE ROTINA", use barreiras identificadas em sala e alertas de rotina para embasar as adaptações propostas. Cite como "conforme observações do professor regente" ou "segundo registro de rotina escolar". Nunca transforme comportamento observado em diagnóstico clínico.

LIMITES DO PAEE:
- Barreiras: até 5 barreiras principais.
- Recursos: até 5 recursos prioritários.
- Estratégias: até 5 estratégias práticas por campo.
- Responsáveis: objetivo e direto.
- Campos narrativos: até 1 parágrafo de 4 a 6 linhas.
- Não transforme cada adaptação em redação longa e não repita o PEI.

RETORNE SOMENTE o JSON válido. Os campos "value" devem conter conteúdo REAL:
{
  "sections": [
    {
      "id": "identificacao",
      "title": "Identificação e Justificativa",
      "fields": [
        { "id": "nome", "label": "Nome completo", "type": "text", "value": "${student.name}" },
        { "id": "diagnostico", "label": "Diagnóstico(s) / CID", "type": "text", "value": "${diagnosis}" },
        { "id": "suporte", "label": "Nível de Suporte", "type": "text", "value": "${student.supportLevel || 'A definir'}" },
        { "id": "justificativa", "label": "Justificativa do PAEE", "type": "textarea", "value": "" },
        { "id": "barreiras", "label": "Barreiras de acessibilidade identificadas", "type": "textarea", "value": "" }
      ]
    },
    {
      "id": "comunicacao",
      "title": "Adaptações de Comunicação e Linguagem",
      "fields": [
        { "id": "com_recursos", "label": "Recursos de comunicação alternativa e aumentativa (CAA)", "type": "textarea", "value": "" },
        { "id": "com_estrategias", "label": "Estratégias de mediação da comunicação em sala", "type": "textarea", "value": "" },
        { "id": "com_tecnologia", "label": "Tecnologia Assistiva de comunicação indicada", "type": "textarea", "value": "" }
      ]
    },
    {
      "id": "material",
      "title": "Adaptações de Material e Avaliação",
      "fields": [
        { "id": "mat_adaptacoes", "label": "Adaptações de material didático e pedagógico", "type": "textarea", "value": "" },
        { "id": "mat_avaliacao", "label": "Adaptações no processo avaliativo", "type": "textarea", "value": "" },
        { "id": "mat_tempo", "label": "Ajustes de tempo e formato de atividades", "type": "textarea", "value": "" }
      ]
    },
    {
      "id": "ambiente",
      "title": "Acessibilidade no Ambiente Escolar",
      "fields": [
        { "id": "amb_fisico", "label": "Adequações no ambiente físico", "type": "textarea", "value": "" },
        { "id": "amb_sensorial", "label": "Adaptações sensoriais (luminosidade, ruído, estímulos)", "type": "textarea", "value": "" },
        { "id": "amb_rotina", "label": "Apoios à organização da rotina e previsibilidade", "type": "textarea", "value": "" }
      ]
    },
    {
      "id": "inclusao_social",
      "title": "Estratégias de Inclusão Social",
      "fields": [
        { "id": "inc_pares", "label": "Estratégias para interação com pares", "type": "textarea", "value": "" },
        { "id": "inc_mediacao", "label": "Papel do professor e equipe na mediação social", "type": "textarea", "value": "" }
      ]
    },
    {
      "id": "familia_paee",
      "title": "Orientações à Família",
      "fields": [
        { "id": "fam_comunicacao", "label": "Como a família pode reforçar a comunicação em casa", "type": "textarea", "value": "" },
        { "id": "fam_rotina", "label": "Apoio à rotina e previsibilidade no ambiente domiciliar", "type": "textarea", "value": "" },
        { "id": "fam_recursos", "label": "Recursos de baixo custo recomendados para uso em casa", "type": "textarea", "value": "" }
      ]
    }
  ]
}

Preencha os campos "value" somente quando houver dados suficientes. Campos sem evidência podem ficar com string vazia ou "Não informado nos dados disponíveis". Cada adaptação deve ser concreta, breve, justificada e implementável. Português brasileiro formal.`;

    // ── PDI ─────────────────────────────────────────────────────────────────────
    } else if (isPDI) {
      prompt = `Você é psicopedagogo especialista em Plano de Desenvolvimento Individual (PDI) para educação inclusiva.

FINALIDADE DO PDI: Documento abrangente que integra metas de desenvolvimento global do aluno — cognitivo, social, emocional, comunicativo e pedagógico — em perspectiva longitudinal. Combina o que o PEI define para o currículo com o que o PAEE define para acessibilidade, acrescentando metas de desenvolvimento pessoal e familiar.

FUNDAMENTAÇÃO LEGAL:
Este PDI é fundamentado na Lei Brasileira de Inclusão (Lei nº 13.146/2015), na LDB (Lei nº 9.394/1996) e nas diretrizes da Política Nacional de Educação Especial na Perspectiva da Educação Inclusiva (PNEEPEI). Ao citar legislação, use apenas as normas acima pelo nome geral — nunca invente artigo, inciso ou resolução específica.

${studentDataBlock}
${familyBlock}

${formalDocumentGuardrails}

REGRAS DE GERAÇÃO:
1. O PDI deve ser interpretativo e objetivo — analise padrões apenas quando houver registros suficientes.
2. Use dados temporais sempre que disponíveis: datas de atendimento, evolução ao longo do tempo, padrões de frequência.
3. Cada meta deve ter: situação atual (baseline) → meta de período → indicador de alcance, de forma curta.
4. Conecte perfil cognitivo, metas, estratégias e papel da família somente quando esses dados existirem no contexto.
5. Inclua análise do contexto familiar como suporte ou risco apenas quando houver informação suficiente.
6. Identifique padrões de avanço ou regressão sem repetir a mesma evidência em várias áreas.
7. Mencione outros profissionais que acompanham o aluno somente se constarem nos dados disponíveis.
8. Linguagem técnica formal. Nunca capacitista. Português brasileiro.
9. EVIDÊNCIAS PEDAGÓGICAS: Se o contexto incluir seção "EVIDÊNCIAS PEDAGÓGICAS E DE ROTINA", use-as para identificar padrões de progresso e barreiras recorrentes. Cite como "conforme registros escolares" ou "observado em sala/rotina". Diferencie laudo clínico de observação pedagógica — não transforme comportamento observado em diagnóstico.
${FORBIDDEN_TERMS_BLOCK}

LIMITES DO PDI:
- Metas: até 3 por área.
- Indicadores: objetivos, observáveis e curtos.
- Estratégias: curtas e aplicáveis.
- Acompanhamento e próximos passos: direto.
- Campos narrativos: até 1 parágrafo de 4 a 6 linhas.

RETORNE SOMENTE o JSON válido com estas seções obrigatórias:
{
  "sections": [
    { "id": "identificacao", "title": "Identificação e Contexto Global", "fields": [
      { "id": "nome", "label": "Nome completo", "type": "text", "value": "${student.name}" },
      { "id": "diagnostico", "label": "Diagnóstico(s) / CID", "type": "text", "value": "${diagnosis}" },
      { "id": "suporte", "label": "Nível de Suporte Global", "type": "text", "value": "${student.supportLevel || 'A definir'}" },
      { "id": "contexto_atual", "label": "Situação atual — síntese interpretativa", "type": "textarea", "value": "" },
      { "id": "fatores_risco", "label": "Fatores de risco e vulnerabilidade identificados", "type": "textarea", "value": "" },
      { "id": "fatores_protecao", "label": "Fatores de proteção e potencialidades", "type": "textarea", "value": "" }
    ]},
    { "id": "historico", "title": "Histórico e Linha do Tempo", "fields": [
      { "id": "trajetoria", "label": "Trajetória escolar e de atendimento (interpretativa)", "type": "textarea", "value": "" },
      { "id": "evolucao", "label": "Evolução observada e padrões identificados", "type": "textarea", "value": "" },
      { "id": "impacto_ausencias", "label": "Impacto das ausências ou interrupções no progresso", "type": "textarea", "value": "" }
    ]},
    { "id": "metas_cognitivas", "title": "Metas de Desenvolvimento Cognitivo e Pedagógico", "fields": [
      { "id": "cog_baseline", "label": "Perfil cognitivo atual (baseline)", "type": "textarea", "value": "" },
      { "id": "cog_metas", "label": "Metas de desenvolvimento por período", "type": "textarea", "value": "" },
      { "id": "cog_indicadores", "label": "Indicadores observáveis de alcance", "type": "textarea", "value": "" }
    ]},
    { "id": "metas_sociais", "title": "Metas de Desenvolvimento Social e Emocional", "fields": [
      { "id": "soc_atual", "label": "Situação atual — interação, autonomia, autorregulação", "type": "textarea", "value": "" },
      { "id": "soc_metas", "label": "Metas socioemocionais por período", "type": "textarea", "value": "" },
      { "id": "soc_estrategias", "label": "Estratégias de mediação social", "type": "textarea", "value": "" }
    ]},
    { "id": "familia_pdi", "title": "Papel da Família e Articulação Familiar", "fields": [
      { "id": "fam_analise", "label": "Análise do contexto familiar como suporte ou risco", "type": "textarea", "value": "" },
      { "id": "fam_metas", "label": "Metas e orientações para a família", "type": "textarea", "value": "" },
      { "id": "fam_articulacao", "label": "Articulação escola-família-clínica", "type": "textarea", "value": "" }
    ]},
    { "id": "equipe", "title": "Equipe Multiprofissional e Próximos Passos", "fields": [
      { "id": "eq_profissionais", "label": "Profissionais envolvidos e papéis", "type": "textarea", "value": "" },
      { "id": "eq_encaminhamentos", "label": "Encaminhamentos e ações prioritárias", "type": "textarea", "value": "" },
      { "id": "eq_revisao", "label": "Periodicidade de revisão do PDI", "type": "text", "value": "" }
    ]}
  ]
}

Preencha os campos "value" somente quando houver dados suficientes. Campos sem evidência podem ficar com string vazia ou "Não informado nos dados disponíveis". Mantenha conteúdo técnico, objetivo e JSON válido. Português brasileiro formal.`;

    // ── Estudo de Caso ────────────────────────────────────────────────────────────
    } else if (isEstudoCaso) {
      prompt = `Você é psicopedagogo especialista em elaboração de Estudos de Caso para educação inclusiva, com domínio em análise interpretativa de dados clínicos e pedagógicos.

FINALIDADE DO ESTUDO DE CASO: Documento-base de toda a documentação pedagógica. Integra e interpreta de forma longitudinal todos os dados disponíveis sobre o aluno. Destina-se a equipes multidisciplinares, órgãos de saúde (CAPS, CRAS, APAE), secretarias de educação e, quando necessário, ao sistema judiciário. Embasa o PEI, o PAEE e o PDI.

FUNDAMENTAÇÃO LEGAL:
Este Estudo de Caso é fundamentado na Lei Brasileira de Inclusão (Lei nº 13.146/2015), na LDB (Lei nº 9.394/1996), no ECA (Lei nº 8.069/1990) e nas diretrizes da PNEEPEI. Ao citar legislação, use apenas as normas acima pelo nome geral — nunca invente artigo, inciso ou resolução específica. Quando pertinente, a menção à legislação deve ser objetiva e institucional, sem transformar o documento em texto jurídico.

ORIENTAÇÕES ÉTICAS DA IA:
- ANALISE, não descreva. "Dificuldade na leitura" é descrição. "A dificuldade na decodificação fonológica compromete o acesso curricular e se intensifica em avaliações formais" é análise.
- A fala dos responsáveis deve ser INTERPRETADA com critério — nunca transcrita como verdade absoluta. Identifique o que revelam, o que omitem, pontos de apoio e resistência.
- NUNCA invente dados, diagnósticos, laudos ou histórico não fornecido. Se um dado estiver ausente, deixe o campo vazio.
- Melhore linguagem, conectivos, gramática e vocabulário técnico sem criar fatos novos.
${FORBIDDEN_TERMS_BLOCK}

${studentDataBlock}
${familyBlock}

${formalDocumentGuardrails}

REGRAS DE GERAÇÃO:
1. USE dados temporais disponíveis: datas, padrões, faltas, impacto das ausências no progresso.
2. INTERPRETE laudos somente quando existirem no contexto; não atribua implicações pedagógicas automáticas apenas pelo diagnóstico.
3. IDENTIFIQUE padrões: o que evolui, o que regride e em quais condições, apenas quando houver registros suficientes.
4. CONECTE dados: perfil cognitivo ↔ laudos ↔ fichas de observação ↔ fala familiar, sem repetir a mesma evidência em seções diferentes.
5. Linguagem técnico-científica. Português brasileiro formal. Sem frases genéricas.
6. EVIDÊNCIAS PEDAGÓGICAS: Se o contexto incluir seção "EVIDÊNCIAS PEDAGÓGICAS E DE ROTINA", integre-as na análise pedagógica e nas seções de atenção, engajamento e comunicação. Cite a origem: "observação em sala (professor regente)" ou "registro de rotina escolar (cuidadora)". Nunca apresente observação pedagógica como diagnóstico. Estratégias que funcionaram devem aparecer na seção de encaminhamentos.

LIMITES DO ESTUDO DE CASO:
- Campos narrativos: até 1 parágrafo de 4 a 6 linhas.
- Listas: até 3 bullets quando o campo pedir enumeração.
- Análises: objetivas, baseadas em evidências e sem repetir diagnóstico em toda seção.
- Campos sem informação devem deixar clara a ausência quando necessário, sem preencher com suposições.

RETORNE SOMENTE o JSON válido com estas seções:
{
  "sections": [
    { "id": "dados_inst", "title": "Dados Institucionais", "fields": [
      { "id": "di_escola",    "label": "Unidade Escolar",        "type": "text", "value": "" },
      { "id": "di_municipio", "label": "Município / Secretaria", "type": "text", "value": "" },
      { "id": "di_data",      "label": "Data de elaboração",     "type": "text", "value": "${new Date().toLocaleDateString('pt-BR')}" }
    ]},
    { "id": "header", "title": "Identificação do Estudante", "fields": [
      { "id": "name",       "label": "Nome completo",                      "type": "text",     "value": "${student.name}" },
      { "id": "d1",         "label": "Diagnóstico e CID",                  "type": "text",     "value": "${diagnosis}" },
      { "id": "id_demanda", "label": "Motivo do Estudo de Caso / Demanda", "type": "textarea", "value": "" }
    ]},
    { "id": "historico", "title": "Histórico de Escolarização", "fields": [
      { "id": "hist1", "label": "Trajetória escolar (escolas, anos, repetências)", "type": "textarea", "value": "" },
      { "id": "hist2", "label": "Percepção do estudante sobre a escola",           "type": "textarea", "value": "" }
    ]},
    { "id": "entrevista", "title": "Entrevista com Responsável", "fields": [
      { "id": "ent1", "label": "Informações e perspectiva trazida pela família",  "type": "textarea", "value": "" },
      { "id": "ent2", "label": "Análise interpretativa da fala dos responsáveis", "type": "textarea", "value": "" }
    ]},
    { "id": "saude", "title": "Informações de Saúde", "fields": [
      { "id": "sau1", "label": "Diagnósticos clínicos e laudos — interpretação clínico-pedagógica", "type": "textarea", "value": "" },
      { "id": "sau2", "label": "Medicações em uso",                              "type": "textarea", "value": "" },
      { "id": "sau3", "label": "Histórico de saúde (gestação, nascimento, desenvolvimento)", "type": "textarea", "value": "" },
      { "id": "sau4", "label": "Profissionais de saúde que acompanham o aluno", "type": "textarea", "value": "" }
    ]},
    { "id": "pedagogico", "title": "Dados Pedagógicos", "fields": [
      { "id": "ped1", "label": "Habilidades e potencialidades pedagógicas",  "type": "textarea", "value": "" },
      { "id": "ped2", "label": "Dificuldades e desafios pedagógicos",        "type": "textarea", "value": "" },
      { "id": "ped3", "label": "Nível de alfabetização / numerização atual", "type": "textarea", "value": "" }
    ]},
    { "id": "comunicacao_ec", "title": "Comunicação", "fields": [
      { "id": "com2", "label": "Comunicação expressiva e receptiva — descrição e análise", "type": "textarea", "value": "" }
    ]},
    { "id": "atencao_ec", "title": "Atenção", "fields": [
      { "id": "at1", "label": "Tempo e qualidade de atenção sustentada",            "type": "textarea", "value": "" },
      { "id": "at2", "label": "Estratégias que auxiliam a manutenção da atenção",  "type": "textarea", "value": "" }
    ]},
    { "id": "engajamento_ec", "title": "Engajamento na Atividade", "fields": [
      { "id": "eng1", "label": "Nível de participação e engajamento",     "type": "textarea", "value": "" },
      { "id": "eng2", "label": "Interesses e motivadores identificados",  "type": "textarea", "value": "" }
    ]},
    { "id": "comportamentos_ec", "title": "Comportamentos Observados", "fields": [
      { "id": "comp1", "label": "Comportamentos frequentes em sala/atendimento",             "type": "textarea", "value": "" },
      { "id": "comp2", "label": "Fatores que antecedem comportamentos desafiadores",        "type": "textarea", "value": "" }
    ]},
    { "id": "sobrecarga_ec", "title": "Sinais de Sobrecarga Sensorial", "fields": [
      { "id": "sob1", "label": "Sinais de sobrecarga observados",         "type": "textarea", "value": "" },
      { "id": "sob2", "label": "Estratégias de regulação utilizadas",    "type": "textarea", "value": "" }
    ]},
    { "id": "interacao_ec", "title": "Interação Social", "fields": [
      { "id": "int1", "label": "Qualidade da interação com pares",   "type": "textarea", "value": "" },
      { "id": "int2", "label": "Qualidade da interação com adultos", "type": "textarea", "value": "" }
    ]},
    { "id": "linguagem_ec", "title": "Linguagem", "fields": [
      { "id": "ling1", "label": "Desenvolvimento da linguagem oral",         "type": "textarea", "value": "" },
      { "id": "ling2", "label": "Compreensão de instruções e textos",       "type": "textarea", "value": "" }
    ]},
    { "id": "leitura_ec", "title": "Leitura", "fields": [
      { "id": "leit1", "label": "Nível de leitura atual (hipótese de escrita)", "type": "textarea", "value": "" },
      { "id": "leit2", "label": "Estratégias utilizadas e avanços observados",  "type": "textarea", "value": "" }
    ]},
    { "id": "escrita_ec", "title": "Escrita", "fields": [
      { "id": "esc1", "label": "Nível de escrita atual (hipótese de escrita)",  "type": "textarea", "value": "" },
      { "id": "esc2", "label": "Estratégias e adaptações utilizadas",           "type": "textarea", "value": "" }
    ]}
  ]
}

Preencha os campos "value" somente quando houver dados suficientes para análise real, técnica e específica. Campos sem evidência podem ficar com string vazia ou "Não informado nos dados disponíveis". Português brasileiro formal e JSON válido.`;

    // ── Plano de Ação AEE ────────────────────────────────────────────────────────
    } else if (isPlanoAcaoAEE) {
      const anoAtual = new Date().getFullYear();
      prompt = `Você é professor especialista em Atendimento Educacional Especializado (AEE) conforme a Resolução CNE/CEB nº 4/2009 e a Lei Brasileira de Inclusão (Lei 13.146/2015).

FINALIDADE: Gere um Plano de Ação do AEE — documento de EXECUÇÃO, operacional e direto — que diz exatamente o que o profissional do AEE deve fazer com este aluno no período. Não é o PAEE (norteador/técnico). É o plano prático de intervenção: o que fazer, com quais recursos, como aplicar, como registrar, qual o próximo passo.

ORIENTAÇÕES ÉTICAS DA IA:
- Todo conteúdo deve ser específico para ESTE aluno — nunca genérico.
- Não invente diagnósticos, laudos ou dados ausentes.
- Não use linguagem clínica como se fosse médico. Foco pedagógico/AEE.
- PAEE deve ser a fonte principal quando estiver disponível. Use Estudo de Caso, PEI, registros AEE e observações apenas como apoio.
- Se não houver PAEE ou dados suficientes, use "não há registro nos dados disponíveis" ou deixe o campo vazio/lista vazia conforme o schema.
- Não transforme ausência de dado em hipótese.
- Diagnóstico/CID é contexto cadastral, não prova funcional. Não deduza comportamento, suporte, autonomia, frequência, evolução, barreiras ou estratégias apenas pelo diagnóstico/CID.
- Evolução, avanço, regressão ou manutenção só podem ser mencionados quando houver registros temporais comparáveis.
- Não faça prescrição terapêutica. Não prometa cura.
- Tom: técnico-pedagógico, claro, direto, orientado para ação.
- Não invente barreiras, recursos, jogos, vídeos, materiais, estratégias ou roteiro de atendimento.
- Cada ação deve se relacionar a barreira registrada, necessidade de acesso, recurso indicado, objetivo do PAEE ou observação pedagógica disponível.
- Recursos, jogos, vídeos, materiais e tecnologias assistivas são opcionais e só devem aparecer quando houver evidência que justifique o uso.
${FORBIDDEN_TERMS_BLOCK}

PROIBIDO — nunca gere frases como:
- "usar estratégias inclusivas"
- "adaptar atividades conforme necessário"
- "promover participação do aluno"

EXEMPLOS DE AÇÕES CONCRETAS — use apenas quando houver evidência nos dados disponíveis:
- "usar cartões visuais com as etapas numeradas (1, 2, 3) antes de cada atividade"
- "dividir a tarefa em blocos de 3 itens com pausa de 2 minutos entre blocos"
- "usar timer visual de 5 minutos para delimitar início e fim da atividade"
- "iniciar com atividade de pareamento de figuras antes da proposta principal"
- "oferecer escolha entre duas opções antes de cada etapa ('você quer o cartão azul ou o verde?')"
- "usar prancha de comunicação com os símbolos: 'quero', 'não quero', 'ajuda', 'pausa'"
- "registrar se realizou com autonomia, com mediação verbal ou recusou a proposta"

EVIDÊNCIAS PEDAGÓGICAS: Se o contexto incluir seção "EVIDÊNCIAS PEDAGÓGICAS E DE ROTINA", use estratégias que funcionaram para preencher recursos e ações concretas somente quando houver registro claro. Use barreiras identificadas para preencher "barreira_prioritaria" e "barreiras_perfil". Cite como "conforme observações em sala" ou "segundo registros escolares". Nunca transforme observação pedagógica em diagnóstico clínico. Na ausência de evidência, use ausência neutra.

LIMITES DO PLANO:
- Objetivos: até 3.
- Ações: até 5.
- Recursos: até 5.
- Acompanhamento e registros: objetivos, sem repetição.
- Roteiro de atendimento: somente se houver dados suficientes para orientar uma sequência real.

${studentDataBlock}
${familyBlock}

RETORNE SOMENTE o JSON válido abaixo. Os campos "value" devem conter CONTEÚDO REAL gerado especificamente para este aluno.
- Seções 1 a 10: preencha somente com conteúdo sustentado pelos dados disponíveis. Se faltar evidência, use "não há registro nos dados disponíveis" ou vazio/lista vazia conforme o tipo de campo.
- Checklists de "barreira_prioritaria" e "recursos_materiais": selecione somente itens registrados ou diretamente sustentados por evidência. Não marque por diagnóstico.
- Checklists de "resposta_aluno" e "proximos_passos": deixe value = [] (serão preenchidos APÓS o atendimento pelo profissional).
- Campos sobre jogos, vídeos, materiais, recursos e tecnologias: use somente se houver relação com barreira, objetivo pedagógico, necessidade de acessibilidade ou registro disponível.
- Seção de assinaturas: deixe value vazio.
- Português brasileiro formal.

{
  "sections": [
    {
      "id": "header",
      "title": "Identificação",
      "fields": [
        { "id": "nome_aluno",       "label": "Nome do Aluno",          "type": "text",   "value": "${student.name}" },
        { "id": "escola",           "label": "Escola",                 "type": "text",   "value": "${student.schoolName || ''}" },
        { "id": "serie",            "label": "Série/Ano",              "type": "text",   "value": "${student.grade || ''}" },
        { "id": "turno",            "label": "Turno",                  "type": "text",   "value": "${student.shift || ''}" },
        { "id": "profissional_aee", "label": "Profissional AEE",       "type": "text",   "value": "${student.aeeTeacher || ''}" },
        { "id": "prof_regente",     "label": "Professor(a) Regente",   "type": "text",   "value": "${student.regentTeacher || ''}" },
        { "id": "periodo_plano",    "label": "Período do Plano",       "type": "select", "value": "Mensal", "options": ["Semanal", "Quinzenal", "Mensal", "Bimestral"] },
        { "id": "data_inicio",      "label": "Data de Início",         "type": "text",   "value": "${new Date().toLocaleDateString('pt-BR')}" },
        { "id": "data_revisao",     "label": "Data de Revisão",        "type": "text",   "value": "" }
      ]
    },
    {
      "id": "perfil_aluno",
      "title": "Síntese do Perfil do Aluno",
      "fields": [
        { "id": "diagnostico",       "label": "Diagnóstico/Condição",        "type": "text",     "value": "${diagnosis}" },
        { "id": "nivel_suporte",     "label": "Nível de Suporte",            "type": "text",     "value": "${student.supportLevel || ''}" },
        { "id": "potencialidades",   "label": "Principais Potencialidades",  "type": "textarea", "value": "" },
        { "id": "barreiras_perfil",  "label": "Principais Barreiras",        "type": "textarea", "value": "" },
        { "id": "obs_relevantes",    "label": "Observações Relevantes",      "type": "textarea", "value": "" }
      ]
    },
    {
      "id": "barreira_prioritaria",
      "title": "Barreira Prioritária do Período",
      "fields": [
        {
          "id": "checklist_barreira",
          "label": "Área Prioritária (selecione a principal barreira deste período)",
          "type": "checklist",
          "value": [],
          "options": [
            "Comunicação", "Atenção/concentração", "Autonomia", "Interação social",
            "Regulação emocional", "Leitura/escrita", "Raciocínio lógico-matemático",
            "Sensorial", "Organização da rotina", "Acessibilidade/tecnologia assistiva",
            "Motricidade", "Participação nas atividades"
          ]
        },
        { "id": "descricao_barreira", "label": "Descrição da Barreira Prioritária", "type": "textarea", "value": "" }
      ]
    },
    {
      "id": "objetivo_pratico",
      "title": "Objetivo Prático do AEE",
      "fields": [
        { "id": "objetivo_principal", "label": "Objetivo Principal do Período",  "type": "textarea", "value": "" },
        { "id": "habilidade_alvo",    "label": "Habilidade-Alvo",               "type": "text",     "value": "" },
        { "id": "resultado_esperado", "label": "Resultado Esperado",            "type": "textarea", "value": "" }
      ]
    },
    {
      "id": "acoes_aee",
      "title": "Ações do AEE",
      "fields": [
        { "id": "acao1",       "label": "Ação 1",               "type": "textarea", "value": "" },
        { "id": "acao2",       "label": "Ação 2",               "type": "textarea", "value": "" },
        { "id": "acao3",       "label": "Ação 3",               "type": "textarea", "value": "" },
        { "id": "frequencia",  "label": "Frequência",            "type": "text",     "value": "" },
        { "id": "duracao",     "label": "Duração Aproximada",    "type": "text",     "value": "" },
        { "id": "responsavel", "label": "Responsável",           "type": "text",     "value": "${student.aeeTeacher || ''}" }
      ]
    },
    {
      "id": "recursos_materiais",
      "title": "Recursos e Materiais",
      "fields": [
        {
          "id": "checklist_recursos",
          "label": "Recursos Selecionados para este Atendimento",
          "type": "checklist",
          "value": [],
          "options": [
            "Prancha visual", "Cartões de rotina", "Cartões de comunicação",
            "Material concreto", "Jogos pedagógicos", "Alfabeto móvel",
            "Material dourado", "Sequência visual", "Tecnologia assistiva",
            "Vídeo curto", "Música", "História social", "Objeto de referência",
            "Timer visual", "Recurso tátil/sensorial"
          ]
        },
        { "id": "outros_recursos", "label": "Outros Recursos", "type": "textarea", "value": "" }
      ]
    },
    {
      "id": "sugestoes_praticas",
      "title": "Sugestões Práticas para o Atendimento",
      "fields": [
        { "id": "jogo_sugerido",      "label": "Jogo Sugerido",                          "type": "text",     "value": "" },
        { "id": "video_sugerido",     "label": "Vídeo Sugerido",                         "type": "text",     "value": "" },
        { "id": "dinamica_sugerida",  "label": "Dinâmica Sugerida",                      "type": "textarea", "value": "" },
        { "id": "atividade_pratica",  "label": "Atividade Prática",                      "type": "textarea", "value": "" },
        { "id": "material_necessario","label": "Material Necessário",                    "type": "text",     "value": "" },
        { "id": "como_aplicar",       "label": "Como Aplicar (passo a passo)",           "type": "textarea", "value": "" },
        { "id": "como_adaptar",       "label": "Como Adaptar se Necessário",             "type": "textarea", "value": "" },
        { "id": "tempo_estimado",     "label": "Tempo Estimado",                         "type": "text",     "value": "" },
        { "id": "como_observar",      "label": "Como Observar a Resposta do Aluno",      "type": "textarea", "value": "" }
      ]
    },
    {
      "id": "roteiro_atendimento",
      "title": "Roteiro do Atendimento",
      "fields": [
        { "id": "acolhimento",         "label": "Acolhimento Inicial",                           "type": "textarea", "value": "" },
        { "id": "apresentacao_rotina", "label": "Apresentação da Rotina",                        "type": "textarea", "value": "" },
        { "id": "ativ_principal",      "label": "Atividade Principal",                           "type": "textarea", "value": "" },
        { "id": "pausa",               "label": "Pausa/Autorregulação (se necessário)",          "type": "textarea", "value": "" },
        { "id": "reg_resposta",        "label": "Registro da Resposta",                          "type": "textarea", "value": "" },
        { "id": "encerramento",        "label": "Encerramento",                                  "type": "textarea", "value": "" },
        { "id": "orient_sala",         "label": "Orientação para Sala Comum/Família (se aplicável)", "type": "textarea", "value": "" }
      ]
    },
    {
      "id": "orientacoes_professor",
      "title": "Orientações para o Professor Regente",
      "fields": [
        { "id": "continuar_estrategia", "label": "Como Continuar a Estratégia na Sala Comum", "type": "textarea", "value": "" },
        { "id": "adaptacao_sugerida",   "label": "Adaptação Sugerida",                        "type": "textarea", "value": "" },
        { "id": "cuidado_importante",   "label": "Cuidado Importante",                        "type": "textarea", "value": "" },
        { "id": "evidencia_observar",   "label": "Evidência que o Professor Deve Observar",   "type": "textarea", "value": "" }
      ]
    },
    {
      "id": "orientacoes_familia",
      "title": "Orientações para a Família",
      "fields": [
        { "id": "atividade_casa",     "label": "Atividade Simples para Casa",  "type": "textarea", "value": "" },
        { "id": "orient_rotina",      "label": "Orientação de Rotina",         "type": "textarea", "value": "" },
        { "id": "cuidado_obs",        "label": "Cuidado/Observação",           "type": "textarea", "value": "" },
        { "id": "comunic_escola",     "label": "Comunicação com a Escola",     "type": "textarea", "value": "" }
      ]
    },
    {
      "id": "resposta_aluno",
      "title": "Registro da Resposta do Aluno",
      "fields": [
        {
          "id": "checklist_resposta",
          "label": "Comportamento Observado (preencher APÓS o atendimento)",
          "type": "checklist",
          "value": [],
          "options": [
            "Realizou com autonomia", "Realizou com mediação verbal", "Realizou com apoio visual",
            "Precisou de apoio físico", "Demonstrou interesse", "Demonstrou resistência",
            "Necessitou de pausa", "Apresentou melhora durante a atividade", "Recusou a proposta",
            "Oscilou atenção", "Comunicou necessidade", "Interagiu com o recurso",
            "Generalizou parcialmente para outra situação"
          ]
        },
        { "id": "obs_resposta", "label": "Observações sobre a Resposta do Aluno", "type": "textarea", "value": "" }
      ]
    },
    {
      "id": "proximos_passos",
      "title": "Próximos Passos",
      "fields": [
        {
          "id": "checklist_proximos",
          "label": "Encaminhamento (preencher APÓS o atendimento)",
          "type": "checklist",
          "value": [],
          "options": [
            "Manter estratégia", "Ajustar recurso", "Trocar atividade", "Reforçar habilidade",
            "Orientar professor regente", "Orientar família", "Registrar nova observação",
            "Reavaliar no próximo atendimento", "Encaminhar para discussão com equipe"
          ]
        },
        { "id": "encaminhamento_final", "label": "Encaminhamento Final", "type": "textarea", "value": "" }
      ]
    },
    {
      "id": "assinaturas",
      "title": "Assinaturas",
      "fields": [
        { "id": "ass_aee",         "label": "Profissional AEE",                  "type": "text", "value": "" },
        { "id": "ass_regente",     "label": "Professor(a) Regente (se aplicável)", "type": "text", "value": "" },
        { "id": "ass_coord",       "label": "Coordenação",                        "type": "text", "value": "" },
        { "id": "ass_responsavel", "label": "Responsável Legal (se necessário)",  "type": "text", "value": "" }
      ]
    }
  ]
}

Ano de referência: ${anoAtual}. Preencha os campos "value" das seções 1–10 somente com conteúdo real, específico, prático e sustentado pelos dados disponíveis. Quando não houver evidência, use ausência neutra ou deixe vazio/lista vazia conforme o schema. Português brasileiro formal.`;

    // ── Genérico (FICHA, outros tipos) ───────────────────────────────────────────
    } else {
      prompt = `Você é especialista em educação inclusiva e documentação pedagógica brasileira conforme a Lei Brasileira de Inclusão (Lei 13.146/2015) e diretrizes do MEC.

Gere o documento pedagógico do tipo "${docLabel}" para o aluno abaixo. Este documento será usado por equipes escolares, famílias e profissionais de saúde.

${studentDataBlock}
${familyBlock}

REGRAS:
1. Nunca gere texto genérico. Todo conteúdo deve partir dos dados reais fornecidos.
2. Se a fala da família estiver disponível, interprete-a — não transcreva.
3. Preencha apenas campos com evidência nos dados disponíveis.
4. Quando não houver dado, use "não há registro nos dados disponíveis" ou string vazia, conforme o schema e a necessidade de leitura.
5. Não invente diagnóstico, CID, medicação, frequência, terapia, evolução, histórico familiar ou acompanhamento externo.
6. Diagnóstico/CID é dado cadastral e não pode ser usado para deduzir dificuldade, comportamento, autonomia, suporte, evolução ou estratégia.
7. Não crie parecer clínico, não gere texto longo sem fonte e não repita a mesma informação em várias seções.
8. Crie somente as seções necessárias para organizar os dados disponíveis, em formato objetivo e compatível com o schema genérico.

RETORNE SOMENTE o JSON válido. Campos "value" devem conter conteúdo REAL:
{
  "sections": [
    {
      "id": "sec1",
      "title": "Nome da Seção",
      "fields": [
        { "id": "f1", "label": "Nome do Campo", "type": "textarea", "value": "" }
      ]
    }
  ]
}

Preencha os campos "value" somente com conteúdo sustentado por evidência nos dados disponíveis. Preserve JSON válido e português brasileiro formal.`;
    }

    let jsonResult: string;
    let serverDebited = false;
    try {
      const { result, creditsRemaining } = await callAIGateway({
        task: 'json', prompt,
        creditsRequired: cost,
        requestType: `protocol_${String(type).toLowerCase()}`,
        // Sprint IA-9: Edge injeta contexto canônico via service_role
        studentId:          student.id,
        buildContextServer: true,
        targetDocType:      mapDocTypeToCategory(String(type)),
      });
      jsonResult    = result;
      serverDebited = creditsRemaining !== undefined;
    } catch (e: any) {
      const msg = e?.message || String(e);
      if (auditId) AiAuditService.completeRequest(auditId, { status: 'failed', latencyMs: Date.now() - t0 });
      throw new Error(msg);
    }

    // Validação de qualidade + reparo automático (sem débito extra de créditos)
    // Limitado a 12s para não bloquear o usuário — o reparo é melhoria opcional
    let aiStatus: AIResultStatus = 'success';
    let aiWarning: string | undefined;

    if (canonicalCtx) {
      try {
        const repairResult = await Promise.race([
          CanonicalStudentContextService.validateAndRepair(
            prompt, jsonResult, mapDocTypeToCategory(String(type)), canonicalCtx,
          ),
          new Promise<null>((_, reject) => setTimeout(() => reject(new Error('repair_timeout')), 12_000)),
        ]);
        if (repairResult) {
          const { output, audit } = repairResult as Awaited<ReturnType<typeof CanonicalStudentContextService.validateAndRepair>>;
          jsonResult = output;
          if (!audit.firstPassApproved) {
            console.info(
              `[AIService] reparo automático — tipo: ${String(type)} | score inicial: ${audit.initialScore} | score final: ${audit.finalScore} | reparado: ${audit.repairSucceeded}`,
              audit.initialIssues,
            );
            if (audit.repairSucceeded) {
              aiStatus  = 'repaired_json';
              aiWarning = 'Algumas partes da resposta automática precisaram ser reorganizadas. Revise o documento antes de finalizar.';
            } else {
              aiStatus  = 'partial_success';
              aiWarning = 'A validação automática identificou inconsistências que não foram totalmente corrigidas. Revise o documento com atenção.';
            }
          }
        }
      } catch { /* validação é opcional — não bloqueia o fluxo */ }
    }

    try {
      JSON.parse(jsonResult);
    } catch {
      console.warn('[AIService.generateProtocolJSON] JSON inválido, usando fallback');
      const fallback = {
        sections: [
          { id: 'sec1', title: 'Identificação do Aluno', fields: [
            { id: 'f1', label: 'Nome', type: 'text', value: student.name },
            { id: 'f2', label: 'Diagnóstico', type: 'text', value: diagnosis },
            { id: 'f3', label: 'Nível de Suporte', type: 'text', value: student.supportLevel || 'Nível 1' },
          ]},
          { id: 'sec2', title: 'Objetivo do Documento', fields: [
            { id: 'f4', label: 'Objetivo Geral', type: 'textarea', value: `Documento ${docLabel} para acompanhamento pedagógico de ${student.name}.` },
          ]},
        ],
      };
      if (auditId) AiAuditService.completeRequest(auditId, { status: 'failed', latencyMs: Date.now() - t0, outputType: 'json', content: 'parse_error_fallback' });
      return {
        json: JSON.stringify(fallback),
        status: 'fallback_used',
        warning: 'Este documento foi gerado com informações mínimas porque a IA encontrou uma inconsistência. Revise antes de usar.',
      };
    }

    if (!serverDebited) await this.deductCredits(user, type, cost);
    if (auditId) AiAuditService.completeRequest(auditId, { status: 'success', latencyMs: Date.now() - t0, outputType: 'json', content: jsonResult.slice(0, 500) });
    return { json: jsonResult, status: aiStatus, warning: aiWarning };
  },

  // ── Análise de documento ────────────────────────────────────────────────────

  async analyzeDocument(name: string, _urlOrBase64: string | undefined, student: Student, user: User): Promise<any> {
    const cost = CREDIT_COSTS.ANALISE_DOCUMENTO;
    if (!(await this.checkCredits(user, cost))) {
      throw insufficientCreditsError(cost, await this.getCreditsBalance(user));
    }

    const diagnosis = (student.diagnosis || []).join(', ') || 'Não informado';
    const prompt = `Você é especialista em educação inclusiva. Analise o documento "${name}" do aluno ${student.name} com foco pedagógico.

${GLOBAL_AI_GUARDRAILS}
ATENÇÃO SOBRE CONTEÚDO DO ARQUIVO: Se o conteúdo textual do documento não foi extraído e fornecido abaixo, NÃO afirme tê-lo lido. Baseie a análise no nome/tipo do documento e nos dados cadastrais do aluno. Indique no campo "synthesis": "Conteúdo textual não disponível — análise baseada no perfil pedagógico e tipo de documento."

Dados do aluno:
- Diagnóstico(s): ${diagnosis}
- Nível de Suporte: ${student.supportLevel || 'Não informado'}
- CID: ${Array.isArray(student.cid) ? student.cid.join(', ') : (student.cid || '—')}

Gere uma análise pedagógica. RETORNE SOMENTE o JSON válido:
{
  "id": "ANALISE-${Date.now()}",
  "documentName": "${name}",
  "date": "${new Date().toLocaleDateString('pt-BR')}",
  "synthesis": "Síntese detalhada...",
  "pedagogicalPoints": ["ponto 1", "ponto 2", "ponto 3"],
  "suggestions": ["sugestão 1", "sugestão 2"],
  "auditCode": "DOC-${Date.now()}"
}`;

    // Separar chamada da IA do parse do JSON para controle preciso de débito.
    // Regra: só debita se a IA respondeu algo (sucesso ou resposta inválida).
    // Falha total (rede, timeout, 402, 500) → sem débito.
    let gwResult: string | undefined;
    let serverDebited = false;

    try {
      const { result, creditsRemaining } = await callAIGateway({
        task: 'json', prompt,
        creditsRequired: cost,
        requestType: 'analyze_document',
      });
      gwResult      = result;
      serverDebited = creditsRemaining !== undefined;
    } catch {
      // IA não respondeu nada: retorna fallback sem cobrar crédito
      return {
        id: `ANALISE-${Date.now()}`, documentName: name,
        date: new Date().toLocaleDateString('pt-BR'),
        synthesis: `Não foi possível conectar ao serviço de IA. Análise baseada nos dados cadastrais de ${student.name} (${diagnosis}).`,
        pedagogicalPoints: [
          'Verificar compatibilidade do diagnóstico com estratégias pedagógicas em uso',
          'Revisar objetivos do PEI com base neste documento',
          'Compartilhar com equipe multidisciplinar',
        ],
        suggestions: [
          'Atualizar o Estudo de Caso com informações deste documento',
          'Informar responsável sobre os encaminhamentos indicados',
        ],
        auditCode: `DOC-${Date.now()}`,
        __ai_status: 'provider_error',
        __ai_warning: 'A IA não respondeu. Esta análise é baseada nos dados cadastrais. Tente novamente mais tarde.',
      };
    }

    // IA respondeu: debita créditos
    if (!serverDebited) await this.deductCredits(user, 'ANALISE_DOCUMENTO', cost);

    try {
      return JSON.parse(gwResult!);
    } catch {
      // IA respondeu mas JSON inválido: crédito já foi debitado acima, retorna fallback sinalizado
      return {
        id: `ANALISE-${Date.now()}`, documentName: name,
        date: new Date().toLocaleDateString('pt-BR'),
        synthesis: `Documento "${name}" recebido. Análise baseada nos dados de ${student.name} (${diagnosis}).`,
        pedagogicalPoints: [
          'Verificar compatibilidade do diagnóstico com estratégias pedagógicas em uso',
          'Revisar objetivos do PEI com base neste documento',
          'Compartilhar com equipe multidisciplinar',
        ],
        suggestions: [
          'Atualizar o Estudo de Caso com informações deste documento',
          'Informar responsável sobre os encaminhamentos indicados',
        ],
        auditCode: `DOC-${Date.now()}`,
        __ai_status: 'validation_failed',
        __ai_warning: 'A resposta da IA estava em formato inválido. Esta análise é uma estimativa baseada nos dados cadastrais.',
      };
    }
  },

  // ── Atividades ──────────────────────────────────────────────────────────────

  async generateActivity(topic: string, student: Student, user: User, options?: ActivityGenOptions | string): Promise<string> {
    const normalized: ActivityGenOptions = !options ? {}
      : typeof options === 'string' ? { imageBase64: options } : options;

    const modelCfg = getModelConfig(normalized.modelId ?? 'texto_apenas');
    const cost     = modelCfg.credit_cost;
    if (!(await this.checkCredits(user, cost))) {
      throw insufficientCreditsError(cost, await this.getCreditsBalance(user));
    }

    const auditId = await AiAuditService.logRequest({
      tenantId: (user as any).tenant_id ?? '', userId: user.id,
      requestType: 'activity', model: modelCfg.id, creditsConsumed: cost,
      inputData: { studentId: student.id, topic, modelId: modelCfg.id },
    });
    const t0 = Date.now();

    const bncc       = (normalized.bnccCodes || []).filter(Boolean);
    const discipline = normalized.discipline?.trim();
    const grade      = normalized.grade?.trim();
    const period     = normalized.period?.trim();
    const asTeacher  = normalized.teacherActivity !== false;
    const formatTeacher = asTeacher ? `
Inclua também:
- **Contexto** (turma/ano/série, disciplina e período)
- **Passo a passo do professor** (com tempo estimado)
- **Extensões** (desafios, variações, casa)
` : '';

    // Bloco de conhecimento prévio para calibrar a atividade
    const pkBlock = buildPKBlock(student);

    // Sprint IA-6: histórico de atividades e estratégias que funcionaram
    let actHistBlock = '';
    let stratBlock   = '';
    if (student.id) {
      try {
        const ctxAct = await CanonicalStudentContextService.buildCanonicalContext(student);
        actHistBlock = buildActivitiesHistoryBlock(ctxAct.generatedActivities, 'atividade_adaptada');
        const packAct = CanonicalStudentContextService.buildEvidencePack(ctxAct, 'atividade_adaptada');
        stratBlock   = buildStrategiesBlock(packAct);
      } catch { /* contexto é opcional */ }
    }

    const prompt = `Você é uma pedagoga especialista em AEE e adaptação curricular.
Crie uma atividade adaptada **concisa** para ${student.name}.

Dados:
- Diagnóstico(s): ${(student.diagnosis || []).join(', ') || 'Não informado'}
- Nível de suporte: ${student.supportLevel || 'Não informado'}
- Disciplina: ${discipline || 'Não informado'}
- Ano/Série: ${grade || 'Não informado'}
- Período/Unidade: ${period || 'Não informado'}
- Tema: ${topic}
- BNCC (se informado): ${bncc.length ? bncc.join(', ') : 'Não informado'}
${pkBlock}${actHistBlock}${stratBlock}${asTeacher ? formatTeacher : ''}
Formato OBRIGATÓRIO (use Markdown):
# [Título curto da atividade]
## Objetivo (1–2 linhas)
## Materiais (lista curta)
## Instruções para o aluno (5–8 linhas)
## Adaptações / Acessibilidade (3–6 bullets)
## Avaliação rápida (rubrica 0–2)
## Alinhamento BNCC
- **Componente curricular:** ...
- **Ano/Série:** ...
- **Código BNCC:** ... _(se não identificável com segurança: "Sugerido — validar com o professor")_
- **Habilidade:** ...
- **Objetivo de aprendizagem:** ...
- **Adaptação inclusiva:** ...
## Observações (2–4 linhas, opcional)

Linguagem direta, adequada ao aluno e à família.
O bloco "Alinhamento BNCC" é OBRIGATÓRIO. Nunca invente código — use "Sugerido — validar com o professor" quando não houver certeza.`;

    const { promptAppend, imageBase64 } = await extractDocxIfNeeded(normalized.imageBase64);

    let textResult: string;
    let serverDebited = false;
    try {
      const { result, creditsRemaining } = await callAIGateway({
        task: 'text', prompt: prompt + promptAppend, imageBase64,
        creditsRequired: cost,
        requestType: 'activity',
      });
      textResult    = result;
      serverDebited = creditsRemaining !== undefined;
    } catch (e: any) {
      if (auditId) AiAuditService.completeRequest(auditId, { status: 'failed', latencyMs: Date.now() - t0 });
      throw e;
    }

    if (!serverDebited) await this.deductCredits(user, `ATIVIDADE:${modelCfg.id}`, cost);
    if (auditId) AiAuditService.completeRequest(auditId, { status: 'success', latencyMs: Date.now() - t0, outputType: modelCfg.output_type, content: textResult.slice(0, 500) });
    return textResult;
  },

  async generateActivityStructured(topic: string, student: Student, user: User, options?: ActivityGenOptions): Promise<AtividadeJSON> {
    const modelCfg = getModelConfig('texto_apenas');
    const cost     = modelCfg.credit_cost;
    if (!(await this.checkCredits(user, cost))) {
      throw insufficientCreditsError(cost, await this.getCreditsBalance(user));
    }

    const diagnosis  = (student.diagnosis || []).join(', ') || 'Não informado';
    const grade      = options?.grade?.trim() || 'Não informado';
    const discipline = options?.discipline?.trim() || 'Não informado';
    const period     = options?.period?.trim() || '';
    const bncc       = (options?.bnccCodes || []).filter(Boolean).join(', ') || '';

    const pkBlockStructured = buildPKBlock(student);

    // Sprint IA-6: histórico de atividades e estratégias que funcionaram
    let actHistBlockStruct = '';
    let stratBlockStruct   = '';
    if (student.id) {
      try {
        const ctxStruct = await CanonicalStudentContextService.buildCanonicalContext(student);
        actHistBlockStruct = buildActivitiesHistoryBlock(ctxStruct.generatedActivities, 'atividade_adaptada');
        const packStruct   = CanonicalStudentContextService.buildEvidencePack(ctxStruct, 'atividade_adaptada');
        stratBlockStruct   = buildStrategiesBlock(packStruct);
      } catch { /* contexto é opcional */ }
    }

    const prompt = `Você é uma pedagoga especialista em AEE e educação inclusiva brasileira.
Crie uma atividade pedagógica adaptada para o aluno abaixo. Siga as regras com rigor.

DISCIPLINA: ${discipline}
TEMA: ${topic}
ANO/SÉRIE: ${grade}
${period ? `PERÍODO: ${period}` : ''}
${bncc ? `BNCC: ${bncc}` : ''}

DADOS DO ALUNO:
- Nome: ${student.name}
- Diagnóstico(s): ${diagnosis}
- Nível de suporte: ${student.supportLevel || 'Não informado'}
${pkBlockStructured}${actHistBlockStruct}${stratBlockStruct}

REGRAS ABSOLUTAS:
1. Idioma: SOMENTE português do Brasil.
2. Título: máx. 8 palavras; direto ao ponto.
3. Subtítulo: máx. 1 linha de contexto (opcional).
4. Instrução: 1 linha de comando curto para o aluno (ex: "Leia e responda.").
5. Questoes (campo legado): lista plana de 3-5 enunciados, sem explicações longas.
6. Blocks (campo rico): exatamente os mesmos conteúdos, mas com tipo detalhado.
   - Varie os tipos: use "question" para discursivas (answerLines 2-4),
     "multiple_choice" para escolha (4 opções cada), "fill_blank" com _____ no texto,
     "drawing" quando pedir para ilustrar, "info" para texto introdutório.
   - Máx. 5 blocos ao total.
7. visualStyle: use "colorful" para Educação Infantil/1º-3º ano; "clean" para 4º-9º ano; "bw" só se solicitado.
8. Nenhum bloco deve ter texto de orientação ao professor; isso vai em observacao_professor.
9. Não invente termos médicos ou diagnósticos.
10. Campo "disciplina" deve ser EXATAMENTE: matematica | portugues | ciencias | ingles | geografia | geral
11. bncc_alinhamento: preencha sempre. Se não identificar o código com segurança, use "Sugerido — validar com o professor" no campo codigo_bncc — nunca invente código aleatório.

RETORNE SOMENTE o JSON (sem markdown, sem explicações):
{
  "disciplina": "${(discipline || 'geral').toLowerCase().replace(/\s+/g,'_').replace('língua_portuguesa','portugues').replace('ciências','ciencias').replace('inglês','ingles').replace('matemática','matematica').replace('geografia','geografia')}",
  "titulo": "Título curto da atividade",
  "subtitulo": "Contexto em 1 linha opcional",
  "instrucao": "Comando direto em 1 linha para o aluno",
  "objetivo": "Objetivo interno (não aparece na folha do aluno)",
  "questoes": ["enunciado 1", "enunciado 2", "enunciado 3"],
  "blocks": [
    {"id":"b1","type":"question","question":"Enunciado discursivo...","answerLines":3},
    {"id":"b2","type":"multiple_choice","question":"Pergunta...","options":["A) Opção","B) Opção","C) Opção","D) Opção"]},
    {"id":"b3","type":"fill_blank","fillText":"Complete: O resultado de 2 + 3 é _____."}
  ],
  "observacao_professor": "Orientação para o professor (separada da folha do aluno)",
  "bncc_alinhamento": {
    "componente": "Nome do componente curricular",
    "ano_serie": "Ano/Série",
    "codigo_bncc": "EF__XX__ (ou 'Sugerido — validar com o professor' se incerto)",
    "habilidade": "Descrição da habilidade BNCC",
    "objetivo": "Objetivo de aprendizagem desta atividade",
    "adaptacao_inclusiva": "Como esta atividade adapta a habilidade para o perfil do aluno"
  },
  "nivel_dificuldade": "Fácil",
  "visualStyle": "colorful"
}`;

    const t0 = Date.now();
    const auditId = await AiAuditService.logRequest({
      tenantId: (user as any).tenant_id ?? '', userId: user.id,
      requestType: 'activity_structured', model: modelCfg.id, creditsConsumed: cost,
      inputData: { studentId: student.id, topic },
    });

    let raw: string;
    let serverDebited = false;
    try {
      const { result, creditsRemaining } = await callAIGateway({
        task: 'json', prompt,
        creditsRequired: cost,
        requestType: 'activity_structured',
      });
      raw           = result;
      serverDebited = creditsRemaining !== undefined;
    } catch (e: any) {
      if (auditId) AiAuditService.completeRequest(auditId, { status: 'failed', latencyMs: Date.now() - t0 });
      throw e;
    }

    let parsed: unknown;
    try { parsed = JSON.parse(raw); }
    catch {
      if (auditId) AiAuditService.completeRequest(auditId, { status: 'failed', latencyMs: Date.now() - t0 });
      throw new Error('A IA retornou um formato inválido. Tente novamente.');
    }

    if (!validateAtividadeJSON(parsed)) {
      if (auditId) AiAuditService.completeRequest(auditId, { status: 'failed', latencyMs: Date.now() - t0 });
      throw new Error('O conteúdo gerado não atende ao formato pedagógico esperado. Tente novamente.');
    }

    if (!serverDebited) await this.deductCredits(user, 'ATIVIDADE_ESTRUTURADA', cost);
    if (auditId) AiAuditService.completeRequest(auditId, { status: 'success', latencyMs: Date.now() - t0, outputType: 'text', content: raw.slice(0, 500) });
    return parsed as AtividadeJSON;
  },

  async generateActivityImage(description: string, student: Student, user: User, options?: ActivityImageOptions): Promise<{ imageUrl: string; guidance: string }> {
    const cost = CREDIT_COSTS.ATIVIDADE_IMAGEM;
    if (!(await this.checkCredits(user, cost))) {
      throw insufficientCreditsError(cost, await this.getCreditsBalance(user));
    }

    const bncc       = (options?.bnccCodes || []).filter(Boolean);
    const discipline = options?.discipline?.trim();
    const grade      = options?.grade?.trim();
    const period     = options?.period?.trim();

    const guidancePrompt = `Você é professora AEE/inclusão. Crie orientações de aplicação para uma atividade visual sobre "${description}".
Estudante: ${student.name} | Diagnóstico: ${student.diagnosis.join(', ')} | Suporte: ${student.supportLevel}
Contexto: Disciplina ${discipline || 'n/i'} · Série ${grade || 'n/i'} · Período ${period || 'n/i'} · BNCC: ${bncc.length ? bncc.join(', ') : 'n/i'}
Entregue em Markdown: 1) Objetivos pedagógicos 2) Como aplicar (passo a passo + tempo) 3) Adaptações (3 níveis) 4) Checklist de evidências`;

    const imagePrompt = `Pedagogical illustration, pure white background, flat design, minimalist, 2D vector style, clean lines. No text inside image. No photographic elements. Subject: ${description}. Style: flat vector, soft colors, friendly and inclusive.`;

    // O custo total (ATIVIDADE_IMAGEM) é cobrado na chamada de imagem.
    // A chamada de guidance (texto) é auxiliar e não cobra créditos separados.
    const [guidanceRes, imageRes] = await Promise.all([
      callAIGateway({
        task: 'text', prompt: guidancePrompt,
        creditsRequired: 0,
        requestType: 'activity_guidance',
      }),
      callAIGateway({
        task: 'image', prompt: imagePrompt,
        creditsRequired: cost,
        requestType: 'activity_image',
      }),
    ]);

    // Guard: só debita no frontend se o servidor não debitou (via chamada de imagem)
    if (imageRes.creditsRemaining === undefined) {
      await this.deductCredits(user, 'ATIVIDADE_IMAGEM', cost);
    }

    return { imageUrl: imageRes.result, guidance: guidanceRes.result };
  },

  // ── Análise de documento com arquivo ───────────────────────────────────────

  async analyzeUploadedDocument(fileBase64: string, _mimeType: string, docType: DocumentType, student: Student, user: User): Promise<DocumentAnalysis> {
    const cost = CREDIT_COSTS.ANALISE_DOCUMENTO;
    if (!(await this.checkCredits(user, cost))) {
      throw insufficientCreditsError(cost, await this.getCreditsBalance(user));
    }

    const basePrompt = `Analise o documento enviado (tipo: ${docType}) do aluno ${student.name} e extraia dados pedagogicamente relevantes para educação inclusiva.

${GLOBAL_AI_GUARDRAILS}
INSTRUÇÃO SOBRE CONTEÚDO DO ARQUIVO: Se o texto do arquivo não foi extraído ou está vazio, NÃO afirme tê-lo lido. Indique no campo "resumo" que o conteúdo não estava acessível e baseie os achados nos metadados disponíveis. Foco pedagógico: barreiras, potencialidades, recomendações escolares — nunca diagnósticos clínicos não fornecidos.

Retorne JSON com: resumo, achados (pedagógicos), recomendações (escolares), sinais de alerta (educacionais), sugestões de adaptações.`;

    const { promptAppend, imageBase64 } = await extractDocxIfNeeded(fileBase64);
    const { result, creditsRemaining } = await callAIGateway({
      task: 'text', prompt: basePrompt + promptAppend, imageBase64,
      creditsRequired: cost,
      requestType: 'analyze_uploaded_doc',
    });

    if (creditsRemaining === undefined) await this.deductCredits(user, 'ANALISE_DOCUMENTO', cost);
    try { return JSON.parse(result); }
    catch { return { summary: result } as any; }
  },

  // ── Prompts genéricos ───────────────────────────────────────────────────────
  // Sem créditos obrigatórios — operações internas sem custo explícito por chamada

  async generateFromPrompt(prompt: string, _user: User): Promise<string> {
    const { result } = await callAIGateway({ task: 'json', prompt });
    return result;
  },

  async generateFromPromptWithImage(prompt: string, imageBase64: string, _user: User): Promise<string> {
    const { result } = await callAIGateway({ task: 'text', prompt, imageBase64 });
    return result;
  },

  async generateIncluiLabActivitySchema(prompt: string, _user: User): Promise<string> {
    const { result } = await callAIGateway({
      task: 'json',
      prompt,
      requestType: 'incluilab_activity_schema',
    });
    return result;
  },

  async generateTextFromPrompt(prompt: string, _user: User): Promise<string> {
    const { result } = await callAIGateway({ task: 'text', prompt });
    return result;
  },

  // ── Imagem ──────────────────────────────────────────────────────────────────

  async generateImageFromPrompt(prompt: string, user: User, costOverride?: number, skipDeduction = false): Promise<string> {
    const cost = costOverride ?? CREDIT_COSTS.INCLUILAB_IMAGE;
    if (!skipDeduction && !(await this.checkCredits(user, cost))) {
      throw insufficientCreditsError(cost, await this.getCreditsBalance(user));
    }

    const { result, creditsRemaining } = await callAIGateway({
      task: 'image', prompt,
      creditsRequired: skipDeduction ? 0 : cost,
      requestType: 'incluilab_image',
    });

    // Guard: só debita localmente se o servidor não debitou e skipDeduction é falso
    if (!skipDeduction && creditsRemaining === undefined) {
      await this.deductCredits(user, 'INCLUILAB_IMAGE', cost);
    }
    return result;
  },

  // ── OCR ─────────────────────────────────────────────────────────────────────

  async extractTextFromImage(base64: string, user: User): Promise<string> {
    const cost = CREDIT_COSTS.OCR || 1;
    if (!(await this.checkCredits(user, cost))) throw insufficientCreditsError(cost);

    const prompt = `Extraia e transcreva TODO o texto visível nesta imagem, exatamente como aparece.
Se for uma atividade ou exercício escolar, preserve a estrutura (enunciado, questões, lacunas, etc.).
Retorne somente o texto extraído, sem comentários adicionais.`;

    const { result, creditsRemaining } = await callAIGateway({
      task: 'text', prompt, imageBase64: base64,
      creditsRequired: cost,
      requestType: 'ocr',
    });

    if (creditsRemaining === undefined) await this.deductCredits(user, 'OCR', cost);
    return result;
  },

  // ── Relatórios ──────────────────────────────────────────────────────────────

  async generateReport(context: string, instruction: string, user: User, modelId?: string): Promise<string> {
    const modelCfg = getModelConfig(modelId ?? 'padrao');
    if (!modelCfg.allowed_contexts.includes('reports')) {
      throw new Error(`Modelo "${modelCfg.name}" não é compatível com geração de relatórios.`);
    }
    const cost = modelCfg.credit_cost;
    if (!(await this.checkCredits(user, cost))) {
      throw insufficientCreditsError(cost, await this.getCreditsBalance(user));
    }

    const fullPrompt = context?.trim()
      ? `${instruction}\n\nCONTEXTO DO DOCUMENTO:\n${context}`
      : instruction;

    const { result, creditsRemaining } = await callAIGateway({
      task: 'text', prompt: fullPrompt,
      creditsRequired: cost,
      requestType: `report_${modelCfg.id}`,
    });

    if (creditsRemaining === undefined) await this.deductCredits(user, `RELATORIO:${modelCfg.id}`, cost);
    return result;
  },

  // ── Adaptação de atividade ──────────────────────────────────────────────────

  async adaptActivityText(text: string, diagnosis: string, grade: string, user: User): Promise<string> {
    const cost = CREDIT_COSTS.ADAPTAR_ATIVIDADE;
    if (!(await this.checkCredits(user, cost))) throw insufficientCreditsError(cost);

    const diagnosisLabels: Record<string, string> = {
      autismo: 'Transtorno do Espectro Autista (TEA)', tdah: 'TDAH',
      dislexia: 'Dislexia', di: 'Deficiência Intelectual',
      geral: 'simplificação geral para inclusão',
    };
    const diagLabel  = diagnosisLabels[diagnosis] || diagnosis;
    const gradeLabel = grade || 'Ensino Fundamental';

    const prompt = `Você é especialista em educação inclusiva e AEE.
Adapte a atividade abaixo para um aluno com ${diagLabel}, série: ${gradeLabel}.

ATIVIDADE ORIGINAL:
${text}

REGRAS: Linguagem simples, frases curtas, instruções numeradas, objetivos pedagógicos mantidos.
Se TEA: suporte visual [imagem: ...]. Se TDAH: tarefas menores, checkboxes. Se Dislexia: espaçamento, menos blocos.
Retorne SOMENTE a atividade adaptada, pronta para uso, em português brasileiro.`;

    const { result, creditsRemaining } = await callAIGateway({
      task: 'text', prompt,
      creditsRequired: cost,
      requestType: 'adapt_activity',
    });

    if (creditsRemaining === undefined) await this.deductCredits(user, 'ADAPTAR_ATIVIDADE', cost);
    return result;
  },

  // ── Salvar atividade ────────────────────────────────────────────────────────

  async saveGeneratedActivity(params: {
    user: User; title: string; templateType: string;
    content: string; imageCount: number; creditsUsed: number;
    studentId?: string; modelUsed?: string;
    outputType?: AIOutputType; imageUrls?: string[];
  }): Promise<{ id: string }> {
    const { user, title, templateType, content, imageCount, creditsUsed, studentId, modelUsed, outputType, imageUrls } = params;

    const firstUrl     = imageUrls?.find((u) => !!u) ?? null;
    const guidanceData = imageUrls?.length
      ? JSON.stringify({ imageUrls, count: imageUrls.length })
      : imageCount > 0 ? JSON.stringify({ count: imageCount }) : null;

    const { data, error } = await supabase
      .from('generated_activities').insert({
        tenant_id: user.tenant_id, user_id: user.id, student_id: studentId || null,
        title, content: content.slice(0, 10000),
        tags: templateType ? [templateType] : [],
        is_adapted: true, credits_used: creditsUsed,
        image_url: firstUrl, guidance: guidanceData,
        model_used: modelUsed ?? null, output_type: outputType ?? 'text',
      }).select('id').single();

    if (error) {
      const isRls    = error.code === '42501' || (error.message ?? '').includes('row-level security');
      const isUnauth = error.code === 'PGRST301' || (error.message ?? '').includes('JWT');
      if (isUnauth) throw new Error('Sessão expirada. Faça login novamente para salvar a atividade.');
      if (isRls)    throw new Error('Sem permissão para salvar. Verifique se sua sessão está ativa e tente novamente.');
      throw new Error('Não foi possível salvar a atividade. Tente novamente.');
    }

    if (studentId && data?.id) {
      try {
        await supabase.from('student_timeline').insert({
          tenant_id: user.tenant_id, student_id: studentId,
          event_type: 'atividade', title: `Atividade gerada: ${title}`,
          description: `Template: ${templateType} · Modelo: ${modelUsed ?? 'padrão'} · ${imageCount > 0 ? `${imageCount} imagens` : 'Texto'} · ${creditsUsed} créditos`,
          linked_id: data.id, linked_table: 'generated_activities',
          icon: 'Zap', author: user.name,
          event_date: new Date().toISOString().split('T')[0],
        });
      } catch { /* timeline é opcional */ }
    }

    return { id: data.id };
  },

  // ── Perfil Inteligente do Aluno ─────────────────────────────────────────────

  async generateIntelligentProfile(
    student: Student,
    user: User,
    versionNumber: number,
    operationId?: string,
  ): Promise<import('./intelligentProfileService').IntelligentProfileJSON> {
    const cost = AI_CREDIT_COSTS.PERFIL_INTELIGENTE;
    if (!(await this.checkCredits(user, cost))) {
      throw insufficientCreditsError(cost, await this.getCreditsBalance(user));
    }

    const missingData  = 'não há registro nos dados disponíveis';
    const diagnosis    = (student.diagnosis || []).join(', ') || missingData;
    const cid          = Array.isArray(student.cid) ? student.cid.join(', ') : (student.cid || '');
    const abilities    = (student.abilities || []).join('; ') || '';
    const difficulties = (student.difficulties || []).join('; ') || '';
    const strategies   = (student.strategies || []).join('; ') || '';

    let ctxBlock = '';
    let canonicalCtxPerfil: CanonicalStudentContext | null = null;
    try {
      canonicalCtxPerfil = await CanonicalStudentContextService.buildCanonicalContext(student);
      if (CanonicalStudentContextService.hasData(canonicalCtxPerfil)) {
        ctxBlock = CanonicalStudentContextService.toPromptText(canonicalCtxPerfil, 'perfil_inteligente');
      }
    } catch {
      try {
        const autoCtx = await StudentContextService.buildContext(student.id);
        if (StudentContextService.hasData(autoCtx)) ctxBlock = StudentContextService.toPromptText(autoCtx);
      } catch { /* contexto é opcional */ }
    }

    const docChainBlockPerfil = canonicalCtxPerfil
      ? buildDocumentChainBlock(canonicalCtxPerfil, 'perfil_inteligente')
      : '';

    const pkBlock = buildPKBlock(student);
    const familyBlock = buildFamilyBlock(student);

    // Orçamento de tamanho do contexto — ver PROMPT_CONTEXT_BUDGET / M-08.
    const perfilContextRaw =
      `${docChainBlockPerfil ? `\n${docChainBlockPerfil}` : ''}${ctxBlock}`;
    const perfilContext = clampPromptContext(perfilContextRaw, PROMPT_CONTEXT_BUDGET);
    logPromptBudget('perfil_inteligente', perfilContext.metrics);

    const prompt = `Você é especialista em educação inclusiva, documentação pedagógica escolar e atendimento educacional especializado (AEE).

Sua tarefa é criar o PERFIL INTELIGENTE do aluno abaixo — uma síntese pedagógica objetiva, institucional e útil para apoiar planejamento escolar, adaptação de atividades e acompanhamento da equipe. Não escreva laudo clínico, parecer psicológico ou diagnóstico.

═══════════════════════════════════════════════════
DADOS DO ALUNO
═══════════════════════════════════════════════════
Nome: ${student.name}
Diagnóstico(s): ${diagnosis}${cid ? ` (CID: ${cid})` : ''}
Nível de Suporte: ${student.supportLevel || missingData}
Série/Turno: ${student.grade || missingData} / ${student.shift || missingData}
Professor Regente: ${student.regentTeacher || missingData}
Professor AEE: ${student.aeeTeacher || missingData}
Habilidades observadas: ${abilities || missingData}
Dificuldades observadas: ${difficulties || missingData}
Estratégias que funcionam: ${strategies || missingData}
Comunicação: ${(student.communication || []).join('; ') || missingData}
Histórico escolar: ${student.schoolHistory || missingData}
Observações gerais: ${student.observations || missingData}
${pkBlock}
${familyBlock}
${perfilContext.text}

═══════════════════════════════════════════════════
REGRAS OBRIGATÓRIAS
═══════════════════════════════════════════════════
1. Toda conclusão deve se apoiar em fonte disponível. Quando possível, cite a origem no próprio texto de forma curta: ficha do aluno, Estudo de Caso, PAEE, PEI, PDI, ficha cognitiva, laudo/documento analisado, observação, registro pedagógico, atendimento, atividade gerada ou perfil anterior.
2. Se não houver evidência para um campo, use exatamente "${missingData}" ou deixe lista vazia quando o schema permitir. Não preencha lacunas por suposição.
3. Diagnóstico ou CID não podem ser usados sozinhos para deduzir comportamento, dificuldade, autonomia, comunicação, evolução, frequência, suporte, estratégia, medicação, terapia ou histórico familiar.
4. Priorize registros pedagógicos, observações, ficha cognitiva, Estudo de Caso, PAEE, PEI, laudos/documentos analisados, atendimentos e atividades geradas. Diferencie fonte clínica de uso pedagógico.
5. NUNCA faça diagnóstico médico. NUNCA afirme transtornos além dos listados. NUNCA gere: "CID provável", "diagnóstico compatível com", "certamente apresenta", "provavelmente possui".
6. Use linguagem humana, acolhedora, objetiva e institucional — sem rótulos, sem termos clínicos indevidos, sem capacitismo.
7. Não reduza o aluno ao diagnóstico. Fale da pessoa e dos registros escolares disponíveis.
8. Não copie integralmente PEI, PAEE, Estudo de Caso ou perfil anterior. Sintetize apenas o que for relevante e cite a fonte.
9. Se houver conflito entre fontes, aponte necessidade de revisão pela equipe escolar; não escolha arbitrariamente.
10. Os checklists devem refletir APENAS dados observados ou registrados. "presente" se claramente observado; "em_desenvolvimento" se parcialmente evidenciado; "nao_observado" se não há dado suficiente.
11. Limites obrigatórios: humanizedIntroduction.text com no máximo 1 parágrafo curto; cada síntese com 1 parágrafo curto; bestLearningStrategies.items até 5; nextSteps até 5; carePoints até 3; observationPoints.checklist até 3; recommendedActivities até 3; sourcesConsidered em lista objetiva.
12. Atividades recomendadas são opcionais: gere até 3 somente se houver base suficiente. Se não houver dados suficientes, retorne [] em recommendedActivities ou uma orientação geral curta em nextSteps. Não use diagnóstico como motor da atividade.
13. O campo incluiLabPrompt deve ser específico, pedagógico e baseado em habilidade/objetivo/apoio registrado. Não use placeholder [diagnóstico] e não dependa de diagnóstico para justificar a atividade.
14. PERFIL ANTERIOR: use apenas como histórico complementar. Não trate como verdade única, não copie e não repita. Só mencione evolução em changesSinceLastVersion se houver registros temporais comparáveis; caso contrário, escreva "${missingData}" ou string vazia.
15. EVIDÊNCIAS PEDAGÓGICAS: Se o contexto incluir seção "EVIDÊNCIAS PEDAGÓGICAS E DE ROTINA", use estratégias que funcionaram para bestLearningStrategies e observações principais para humanizedIntroduction/pedagogicalReport. Cite como "conforme registro pedagógico" ou "observado em sala" — nunca como laudo clínico.
16. FONTES CONSIDERADAS: Preencha "sourcesConsidered" apenas com fontes efetivamente usadas. Seja específico e objetivo.
17. Português brasileiro formal. Sem markdown no interior dos textos (sem asteriscos, sem #).
18. RETORNE SOMENTE o JSON válido abaixo. Sem markdown, sem \`\`\`json, sem texto antes ou depois.

═══════════════════════════════════════════════════
ESTRUTURA JSON OBRIGATÓRIA
═══════════════════════════════════════════════════
{
  "studentName": "${student.name}",
  "generatedAt": "${new Date().toISOString()}",
  "generatedBy": "${user.name || ''}",
  "version": ${versionNumber},
  "firstPersonLetter": "Carta curta (2-3 frases) em 1ª pessoa, acolhedora e baseada apenas em características registradas. Se não houver dados suficientes sobre interesses ou preferências, escreva uma apresentação neutra sem inventar.",
  "humanizedIntroduction": {
    "title": "Conhecendo ${student.name}",
    "text": "No máximo 1 parágrafo curto sobre quem é o aluno, com potencialidades, participação, autonomia ou interesses apenas quando houver registro. Indique fonte quando couber."
  },
  "neuropsychologicalReport": {
    "text": "Síntese pedagógica/institucional sobre aspectos de aprendizagem, organização, atenção, autorregulação ou participação observados em contexto escolar. Linguagem pedagógica, nunca clínica. Use o nome do campo por compatibilidade, mas não escreva parecer neuropsicológico clínico.",
    "checklist": [
      "Apoio pedagógico/adaptação concreta baseada em fonte registrada 1",
      "Apoio pedagógico/adaptação concreta baseada em fonte registrada 2",
      "Apoio pedagógico/adaptação concreta baseada em fonte registrada 3"
    ]
  },
  "pedagogicalReport": {
    "text": "1 parágrafo curto sobre o perfil pedagógico atual, citando o que está registrado como consolidado, em desenvolvimento ou sem registro suficiente.",
    "checklist": [
      { "label": "Autonomia nas atividades", "status": "presente|em_desenvolvimento|nao_observado" },
      { "label": "Resposta a comandos simples", "status": "presente|em_desenvolvimento|nao_observado" },
      { "label": "Compreensão de instruções", "status": "presente|em_desenvolvimento|nao_observado" },
      { "label": "Participação em atividades individuais", "status": "presente|em_desenvolvimento|nao_observado" },
      { "label": "Participação em atividades coletivas", "status": "presente|em_desenvolvimento|nao_observado" },
      { "label": "Necessidade de mediação", "status": "presente|em_desenvolvimento|nao_observado" },
      { "label": "Uso de apoio visual", "status": "presente|em_desenvolvimento|nao_observado" },
      { "label": "Ritmo de aprendizagem compatível com a turma", "status": "presente|em_desenvolvimento|nao_observado" },
      { "label": "Habilidades pedagógicas consolidadas", "status": "presente|em_desenvolvimento|nao_observado" },
      { "label": "Habilidades pedagógicas em desenvolvimento", "status": "presente|em_desenvolvimento|nao_observado" }
    ]
  },
  "neuroPedagogicalReport": {
    "text": "1 parágrafo curto sobre necessidades pedagógicas observáveis relacionadas a aprendizagem, organização, mediação e rotina escolar. Não use linguagem clínica nem deduza funcionamento cerebral.",
    "checklist": [
      { "label": "Atenção sustentada", "status": "presente|em_desenvolvimento|nao_observado" },
      { "label": "Memória de trabalho", "status": "presente|em_desenvolvimento|nao_observado" },
      { "label": "Organização da rotina", "status": "presente|em_desenvolvimento|nao_observado" },
      { "label": "Tolerância a mudanças", "status": "presente|em_desenvolvimento|nao_observado" },
      { "label": "Autorregulação emocional", "status": "presente|em_desenvolvimento|nao_observado" },
      { "label": "Processamento de instruções verbais", "status": "presente|em_desenvolvimento|nao_observado" },
      { "label": "Resposta a estímulos visuais", "status": "presente|em_desenvolvimento|nao_observado" },
      { "label": "Tempo de resposta adequado ao contexto", "status": "presente|em_desenvolvimento|nao_observado" }
    ]
  },
  "learningProfile": {
    "text": "1 parágrafo curto sobre formas de aprendizagem observadas nos registros. Não classifique estilo de aprendizagem sem evidência.",
    "attentionSpan": "Informe somente se houver registro objetivo; caso contrário use não há registro nos dados disponíveis"
  },
  "bestLearningStrategies": {
    "text": "Parágrafo curto sobre estratégias registradas como úteis ou possibilidades pedagógicas diretamente sustentadas pelos dados.",
    "items": [
      "Estratégia concreta baseada em fonte registrada 1",
      "Estratégia concreta baseada em fonte registrada 2",
      "Estratégia concreta baseada em fonte registrada 3"
    ]
  },
  "recommendedActivities": [
    {
      "title": "Título da atividade 1",
      "objective": "Objetivo pedagógico",
      "howToApply": "Como aplicar em 1-2 frases.",
      "whyItHelps": "Por que ajuda, citando a evidência pedagógica que sustenta a sugestão.",
      "supportLevel": "Baixo|Médio|Alto",
      "incluiLabPrompt": "Crie uma atividade pedagógica para ${student.name}, da série/ano registrado, com objetivo de [habilidade/objetivo registrado]. Use [apoio/recurso registrado]."
    },
    { "title": "Atividade 2 opcional", "objective": "", "howToApply": "", "whyItHelps": "", "supportLevel": "Médio", "incluiLabPrompt": "" },
    { "title": "Atividade 3 opcional", "objective": "", "howToApply": "", "whyItHelps": "", "supportLevel": "Alto", "incluiLabPrompt": "" }
  ],
  "strengths": [
    "Potencialidade concreta registrada 1",
    "Potencialidade concreta registrada 2",
    "Potencialidade concreta registrada 3"
  ],
  "challenges": [
    {
      "title": "Nome do desafio/barreira registrado 1",
      "description": "Descrição específica em 1 frase, com manifestação observável e fonte quando possível."
    },
    {
      "title": "Nome do desafio/barreira registrado 2",
      "description": "Descrição."
    },
    {
      "title": "Nome do desafio/barreira registrado 3",
      "description": "Descrição."
    }
  ],
  "observationPoints": {
    "text": "Parágrafo curto orientando a equipe sobre o que observar nas próximas semanas, sem afirmar evolução sem registros temporais.",
    "checklist": [
      "Aumento de autonomia nas tarefas propostas",
      "Engajamento nas atividades recomendadas",
      "Resposta aos apoios pedagógicos registrados"
    ]
  },
  "carePoints": [
    "Ponto de cuidado pedagógico registrado 1",
    "Ponto de cuidado pedagógico registrado 2",
    "Ponto de cuidado pedagógico registrado 3"
  ],
  "nextSteps": [
    "Próximo passo pedagógico baseado em evidência 1",
    "Próximo passo pedagógico baseado em evidência 2",
    "Próximo passo pedagógico baseado em evidência 3"
  ],
  "sourcesConsidered": [
    "Fonte 1 utilizada (ex: Ficha do aluno)",
    "Fonte 2 (ex: Estudo de Caso, Laudos, Fichas cognitivas, Perfil anterior versão N)"
  ],
  "changesSinceLastVersion": "Apenas quando version >= 2, houver perfil anterior no contexto e houver registros temporais comparáveis: descreva em 1-2 frases mudanças sustentadas por evidência. Se não houver base temporal, use string vazia ou não há registro nos dados disponíveis."
}`;

    const t0 = Date.now();
    const auditId = await AiAuditService.logRequest({
      tenantId: (user as any).tenant_id ?? '', userId: user.id,
      requestType: 'perfil_inteligente', model: 'gemini-2.5-flash',
      creditsConsumed: cost,
      inputData: { studentId: student.id, studentName: student.name, versionNumber },
    });

    let raw: string;
    let serverDebited = false;
    try {
      const { result, creditsRemaining } = await callAIGateway({
        task: 'json', prompt,
        creditsRequired: cost,
        requestType: 'perfil_inteligente',
        operationId,
      });
      raw = result;
      serverDebited = creditsRemaining !== undefined;
    } catch (e) {
      if (auditId) AiAuditService.completeRequest(auditId, { status: 'failed', latencyMs: Date.now() - t0, outputType: 'json', content: String(e) });
      throw e;
    }

    const cleaned = cleanJsonString(raw);

    let parsed: import('./intelligentProfileService').IntelligentProfileJSON;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      if (auditId) AiAuditService.completeRequest(auditId, { status: 'failed', latencyMs: Date.now() - t0, outputType: 'json', content: 'parse_error' });
      throw new Error('A IA retornou um formato inesperado. Tente novamente.');
    }

    if (!serverDebited) await this.deductCredits(user, 'PERFIL_INTELIGENTE', cost);
    if (auditId) AiAuditService.completeRequest(auditId, { status: 'success', latencyMs: Date.now() - t0, outputType: 'json', content: JSON.stringify(parsed).slice(0, 500) });

    return parsed;
  },

  // ── Relatório de aluno ──────────────────────────────────────────────────────

  async generateStudentReport(
    student: Student, user: User, type: 'simple' | 'full',
    options: { scores?: number[]; observation?: string; modelId?: string; school?: import('../types').SchoolConfig | null } = {},
  ): Promise<import('./reportService').RelatorioResultado> {
    const { generateStudentReport: _gen } = await import('./reportService');
    return _gen({
      student, user,
      mode: type === 'full' ? 'completo' : 'simples',
      scores: options.scores, observation: options.observation,
      modelId: options.modelId, school: options.school,
    });
  },

  // ── Plano de Ação do Professor Regente ────────────────────────────────────────

  async generateActionPlan(
    student: Student,
    user: User,
    period: import('../types').ActionPlanPeriod,
    versionNumber: number,
    operationId?: string,
  ): Promise<import('../types').ActionPlanJSON> {
    const cost = AI_CREDIT_COSTS.PLANO_ACAO;
    if (!(await this.checkCredits(user, cost))) {
      throw insufficientCreditsError(cost, await this.getCreditsBalance(user));
    }

    const missingData  = 'não há registro nos dados disponíveis';
    const diagnosis    = (student.diagnosis || []).join(', ') || missingData;
    const cid          = Array.isArray(student.cid) ? student.cid.join(', ') : (student.cid || '');
    const abilities    = (student.abilities || []).join('; ') || '';
    const difficulties = (student.difficulties || []).join('; ') || '';
    const strategies   = (student.strategies || []).join('; ') || '';

    let ctxBlock = '';
    let canonicalCtxRegente: CanonicalStudentContext | null = null;
    try {
      canonicalCtxRegente = await CanonicalStudentContextService.buildCanonicalContext(student);
      if (CanonicalStudentContextService.hasData(canonicalCtxRegente)) {
        ctxBlock = CanonicalStudentContextService.toPromptText(canonicalCtxRegente, 'plano_acao_regente');
      }
    } catch { /* contexto é opcional */ }

    const docChainBlockRegente = canonicalCtxRegente
      ? buildDocumentChainBlock(canonicalCtxRegente, 'plano_acao_regente')
      : '';

    const pkBlock = buildPKBlock(student);

    // Orçamento de tamanho — recorta o contexto histórico por seções inteiras,
    // do fim (menor prioridade) para o começo, para o prompt final nunca
    // ultrapassar o limite do Gateway. (M-08)
    const regenteContextRaw =
      `${docChainBlockRegente ? `\n${docChainBlockRegente}` : ''}` +
      `${ctxBlock ? `\n═══ CONTEXTO PEDAGÓGICO ADICIONAL ═══\n${ctxBlock}` : ''}`;
    const regenteContext = clampPromptContext(regenteContextRaw, PROMPT_CONTEXT_BUDGET);
    logPromptBudget('plano_acao', regenteContext.metrics);

    const periodLabel =
      period === 'semanal'   ? 'SEMANAL (próximos 5 dias letivos)'   :
      period === 'mensal'    ? 'MENSAL (próximo mês letivo)'          :
      period === 'bimestral' ? 'BIMESTRAL (próximo bimestre letivo)'  :
      'MACRO ANUAL (referência ampla)';

    const prompt = `Você é especialista em educação inclusiva, planejamento pedagógico de sala comum e orientação prática ao professor regente.

Sua tarefa: gerar um PLANO DE AÇÃO DO PROFESSOR REGENTE — documento PRÁTICO, DIRETO e APLICÁVEL para o período ${periodLabel}. Este plano é o guia de sala comum para rotina pedagógica, participação, adaptação de atividades, avaliação, comunicação com AEE/família e continuidade pedagógica. Não é Plano AEE e não substitui PEI, PAEE ou Estudo de Caso.

═══════════════════════════════════════
DADOS DO ALUNO
═══════════════════════════════════════
Nome: ${student.name}
Diagnóstico(s): ${diagnosis}${cid ? ` (CID: ${cid})` : ''}
Nível de Suporte: ${student.supportLevel || missingData}
Série/Turno: ${student.grade || missingData} / ${student.shift || missingData}
Professor Regente: ${student.regentTeacher || missingData}
Professor AEE: ${student.aeeTeacher || missingData}
Habilidades: ${abilities || missingData}
Dificuldades: ${difficulties || missingData}
Estratégias que funcionam: ${strategies || missingData}
Comunicação: ${(student.communication || []).join('; ') || missingData}
${pkBlock}
${regenteContext.text}

═══════════════════════════════════════
REGRAS CRÍTICAS — LEIA ANTES DE GERAR
═══════════════════════════════════════
PROIBIDO — nunca gere frases como:
- "trabalhar inclusão de forma colaborativa"
- "adaptar atividades conforme necessário"
- "usar recursos lúdicos e atrativos"
- "promover participação do aluno"
- "aplicar estratégias inclusivas"

OBRIGATÓRIO — substitua por ações concretas como:
- "Dividir a atividade em 3 blocos de 4 questões, com pausa de 2 min entre blocos"
- "Posicionar ${student.name} na primeira fila, próximo ao professor"
- "Apresentar o cartão de rotina visual antes de cada transição de atividade"
- "Usar timer visual de 5 minutos para delimitar início e fim de cada tarefa"
- "Oferecer a atividade com metade das questões da turma, mas com os mesmos objetivos"
- "Registrar se concluiu com autonomia, com mediação verbal ou recusou a proposta"

FONTES E LIMITES DO PLANO REGENTE:
- Considere Estudo de Caso + PEI + PAEE quando estiverem disponíveis no contexto. Use a Ficha do Aluno, observações, registros pedagógicos, laudos/documentos analisados e Perfil Inteligente apenas como apoio.
- Se PAEE, PEI ou Estudo de Caso não estiverem no contexto recebido, reconheça a ausência quando relevante e não invente recursos, barreiras, adaptações ou estratégias.
- Não copie integralmente PEI, PAEE ou Estudo de Caso. Sintetize somente o que vira ação prática de sala comum.
- Prioridades/focusPlan: até 3 itens.
- Ações práticas nos blocos beforeClass, duringClass e activitiesStrategies: até 5 itens por bloco.
- Adaptações: até 5 itens.
- Avaliação/acompanhamento: até 3 critérios objetivos.
- Comunicação com AEE/família: objetiva e relacionada à rotina escolar.
- Jogos, vídeos, materiais e dinâmicas são opcionais; gere somente quando houver evidência pedagógica suficiente. Se não houver base, deixe o bloco com lista vazia ou omita o bloco opcional mantendo o JSON parseável.

EVIDÊNCIAS PEDAGÓGICAS: Se o contexto incluir seção "EVIDÊNCIAS PEDAGÓGICAS E DE ROTINA", use estratégias que funcionaram para embasar beforeClass, duringClass, activitiesStrategies, adaptations e communicationTeam. Use barreiras identificadas para embasar mainBarrier e focusPlan. Cite como "conforme observações do professor regente em sala" quando aplicável. Nunca transforme observação pedagógica em diagnóstico clínico.
HISTÓRICO DE ATIVIDADES E ESTRATÉGIAS: Se o contexto incluir seção "ATIVIDADES PEDAGÓGICAS JÁ GERADAS", use o histórico apenas para continuidade pedagógica em activitiesStrategies, suggestedGames, suggestedMaterials ou suggestedDynamics quando houver base — nunca repetir formato idêntico sem justificativa. Se houver seção "ESTRATÉGIAS QUE FUNCIONARAM", priorize-as nas ações práticas. Se houver "ESTRATÉGIAS QUE EXIGEM CAUTELA", reflita isso em mainBarrier, adaptations e attentionObservations.
REGRAS DE EVIDÊNCIA: Toda ação deve se apoiar em dado disponível. Diagnóstico ou CID não podem ser usados sozinhos para deduzir comportamento, suporte, autonomia, comunicação, estratégia, frequência ou evolução. Se faltar evidência, use "${missingData}" ou lista vazia quando o schema permitir. Não invente diagnóstico, CID, terapia, medicação, acompanhamento externo, jogos, vídeos, dinâmicas, materiais, frequência ou evolução. Não fale de evolução sem registros temporais comparáveis. Não transforme este plano em Plano AEE, prescrição clínica ou intervenção terapêutica.
${FORBIDDEN_TERMS_BLOCK}

═══════════════════════════════════════
ESTRUTURA JSON OBRIGATÓRIA
═══════════════════════════════════════
Retorne SOMENTE o JSON abaixo. Preserve exatamente os nomes dos campos. Preencha campos "text" somente quando houver evidência suficiente para ${student.name}. Nunca repita itens entre blocos. Nenhum placeholder. Blocos opcionais podem ter "items": [] quando não houver base.

{
  "period": "${period}",
  "generatedAt": "${new Date().toISOString()}",
  "generatedBy": "${(user as any)?.id ?? ''}",
  "generatedByName": "${(user as any)?.name ?? (user as any)?.email ?? 'Profissional'}",
  "registrationNumber": "",
  "version": ${versionNumber},

  "practicalObjective": "Objetivo prático curto e direto do período — máx. 2 linhas. Ex: Concluir atividades de leitura com apoio visual e mediação verbal, mantendo participação por blocos de 10 minutos.",

  "focusPlan": {
    "title": "Foco do Plano",
    "items": [
      { "id": "fp1", "text": "Área prioritária 1 — ex: Atenção/concentração durante atividades longas", "done": false },
      { "id": "fp2", "text": "Área prioritária 2", "done": false },
      { "id": "fp3", "text": "Área prioritária 3 (se aplicável)", "done": false }
    ]
  },

  "mainBarrier": {
    "title": "Barreira Principal em Sala",
    "items": [
      { "id": "mb1", "text": "Barreira observada: [descrição específica da barreira]", "done": false },
      { "id": "mb2", "text": "Impacto na aprendizagem: [como a barreira afeta a participação e aprendizagem]", "done": false },
      { "id": "mb3", "text": "Momento em que mais aparece: [ex: durante atividades escritas longas, em transições, atividades coletivas]", "done": false }
    ]
  },

  "beforeClass": {
    "title": "Antes da Aula",
    "items": [
      { "id": "bc1", "text": "Ação concreta de preparação do ambiente para ${student.name}", "done": false },
      { "id": "bc2", "text": "Ação sobre organização dos materiais adaptados", "done": false },
      { "id": "bc3", "text": "Ação de comunicação prévia (antecipar rotina/mudança)", "done": false },
      { "id": "bc4", "text": "Ação sobre posicionamento ou agrupamento da turma", "done": false },
      { "id": "bc5", "text": "Ação sobre agenda visual ou rotina do dia", "done": false }
    ]
  },

  "duringClass": {
    "title": "Durante a Aula",
    "items": [
      { "id": "dc1", "text": "Estratégia de acolhimento específica no início da aula", "done": false },
      { "id": "dc2", "text": "Como dar as instruções (frases curtas, modelo visual, etc.)", "done": false },
      { "id": "dc3", "text": "Suporte à atenção/foco — ex: toque no ombro, nome, timer visual", "done": false },
      { "id": "dc4", "text": "Como lidar com recusa ou resistência neste período", "done": false },
      { "id": "dc5", "text": "Estratégia de participação — ex: oferecer escolha entre duas opções", "done": false },
      { "id": "dc6", "text": "Uso de recurso alternativo concreto durante a tarefa", "done": false }
    ]
  },

  "activitiesStrategies": {
    "title": "Atividades e Estratégias",
    "items": [
      { "id": "as1", "text": "Tipo de atividade prioritária com como aplicar", "done": false },
      { "id": "as2", "text": "Adaptação concreta da tarefa escrita/avaliação", "done": false },
      { "id": "as3", "text": "Recurso pedagógico específico para usar neste período", "done": false },
      { "id": "as4", "text": "Estratégia de trabalho em grupo ou em dupla", "done": false },
      { "id": "as5", "text": "Atividade de generalização — aplicar habilidade em novo contexto", "done": false }
    ]
  },

  "assessment": {
    "title": "Avaliação",
    "items": [
      { "id": "av1", "text": "Forma de avaliação adaptada — ex: oral, por apontar, por desenho", "done": false },
      { "id": "av2", "text": "Critério observável de progresso para o período", "done": false },
      { "id": "av3", "text": "Tipo de registro a manter — ex: foto, anotação, checklist diário", "done": false },
      { "id": "av4", "text": "Indicador de avanço concreto a reportar ao AEE", "done": false },
      { "id": "av5", "text": "Ajuste de meta caso o aluno supere ou não alcance o esperado", "done": false }
    ]
  },

  "attentionObservations": {
    "title": "Atenção e Observações",
    "items": [
      { "id": "ao1", "text": "Sinal específico de sobrecarga a observar em ${student.name}", "done": false },
      { "id": "ao2", "text": "Gatilho a evitar ou monitorar neste período", "done": false },
      { "id": "ao3", "text": "Estratégia de pausa/saída — quando e como oferecer", "done": false },
      { "id": "ao4", "text": "Observação sobre transições entre atividades ou ambientes", "done": false },
      { "id": "ao5", "text": "Ponto de atenção sobre saúde, medicação ou rotina familiar", "done": false }
    ]
  },

  "communicationTeam": {
    "title": "Comunicação com AEE / Família",
    "items": [
      { "id": "ct1", "text": "Ponto concreto a comunicar ao professor AEE esta semana/mês", "done": false },
      { "id": "ct2", "text": "Informação ou orientação específica para a família", "done": false },
      { "id": "ct3", "text": "Situação que requer atenção da coordenação pedagógica", "done": false },
      { "id": "ct4", "text": "Próximo encaminhamento ou articulação com equipe", "done": false },
      { "id": "ct5", "text": "O que registrar no diário/caderneta de comunicação", "done": false }
    ]
  },

  "suggestedGames": {
    "title": "Jogos Sugeridos",
    "items": [
      { "id": "g1", "text": "Jogo 1: [Nome específico do jogo] — Como usar: [passo a passo em 2 frases] — Objetivo: [o que trabalha]", "done": false },
      { "id": "g2", "text": "Jogo 2: [Nome específico] — Como usar: [passo a passo] — Objetivo: [o que trabalha]", "done": false },
      { "id": "g3", "text": "Jogo 3 (opcional): [Nome] — Como usar: [passo a passo]", "done": false }
    ]
  },

  "suggestedVideos": {
    "title": "Vídeos Sugeridos",
    "items": [
      { "id": "v1", "text": "Tipo de vídeo: [descrição do conteúdo visual, ex: rotina de início/meio/fim de atividade] — Duração: máx. 3 min — Quando exibir: [antes da atividade principal] — Objetivo: [o que o vídeo ajuda a trabalhar]", "done": false },
      { "id": "v2", "text": "Tipo de vídeo 2 (opcional): [descrição] — Duração: máx. 3 min — Quando usar: [contexto]", "done": false }
    ]
  },

  "suggestedMaterials": {
    "title": "Materiais Sugeridos",
    "items": [
      { "id": "m1", "text": "Material: [nome] — Como usar: [instrução concreta de uso]", "done": false },
      { "id": "m2", "text": "Material: [nome] — Como usar: [instrução concreta]", "done": false },
      { "id": "m3", "text": "Material: [nome] — Como usar: [instrução]", "done": false },
      { "id": "m4", "text": "Material: [nome] — Como usar: [instrução]", "done": false }
    ]
  },

  "suggestedDynamics": {
    "title": "Dinâmicas Sugeridas",
    "items": [
      { "id": "d1", "text": "Dinâmica: [nome] — Passos: 1) [passo] 2) [passo] 3) [passo] — Duração: [tempo]", "done": false },
      { "id": "d2", "text": "Dinâmica: [nome] — Passos: 1) [passo] 2) [passo] — Duração: [tempo]", "done": false }
    ]
  },

  "adaptations": {
    "title": "Adaptações da Atividade",
    "items": [
      { "id": "ad1", "text": "Reduzir quantidade de questões — de X para Y, mantendo o objetivo", "done": false },
      { "id": "ad2", "text": "Dividir em etapas numeradas com cartões visuais", "done": false },
      { "id": "ad3", "text": "Usar fonte maior e mais espaçada nas folhas", "done": false },
      { "id": "ad4", "text": "Oferecer exemplo já resolvido antes da atividade", "done": false },
      { "id": "ad5", "text": "Permitir resposta por apontar, desenhar ou oral", "done": false },
      { "id": "ad6", "text": "Dar tempo ampliado sem pressão de finalizar junto com a turma", "done": false }
    ]
  },

  "evidenceRecording": {
    "title": "Como Registrar Evidências",
    "items": [
      { "id": "ev1", "text": "Tirar foto da atividade concluída (com ou sem auxílio)", "done": false },
      { "id": "ev2", "text": "Registrar no caderno: atividade, nível de ajuda, resposta do aluno", "done": false },
      { "id": "ev3", "text": "Usar checklist diário: autonomia / mediação / recusa / pausa", "done": false },
      { "id": "ev4", "text": "Anotar tempo de permanência na tarefa antes de dispersar", "done": false },
      { "id": "ev5", "text": "Comparar antes/depois: registrar como era na semana 1 e como está agora", "done": false }
    ]
  },

  "studentResponse": {
    "title": "Resposta do Aluno (preencher após o atendimento)",
    "items": [
      { "id": "sr1", "text": "Realizou com autonomia", "done": false },
      { "id": "sr2", "text": "Realizou com mediação verbal", "done": false },
      { "id": "sr3", "text": "Precisou de apoio visual", "done": false },
      { "id": "sr4", "text": "Necessitou de pausa", "done": false },
      { "id": "sr5", "text": "Demonstrou interesse e engajamento", "done": false },
      { "id": "sr6", "text": "Apresentou resistência ou recusa", "done": false },
      { "id": "sr7", "text": "Melhorou com a adaptação utilizada", "done": false },
      { "id": "sr8", "text": "Precisou de apoio constante durante toda a atividade", "done": false }
    ]
  },

  "nextStep": "Próximo passo concreto — ex: Manter estratégia e registrar evolução / Ajustar duração dos blocos / Conversar com família sobre rotina em casa / Encaminhar ao AEE para discussão"
}

IMPORTANTE: substitua os textos de exemplo por ações reais e específicas para ${student.name} com base nas fontes disponíveis, especialmente Estudo de Caso, PEI e PAEE quando presentes. Use diagnóstico apenas como dado registrado, nunca como motor das ações. Nunca repita item entre blocos. Português brasileiro formal.`;

    const t0 = Date.now();
    const auditId = await AiAuditService.logRequest({
      tenantId: (user as any).tenant_id ?? '', userId: user.id,
      requestType: 'plano_acao', model: 'gemini-2.5-flash',
      creditsConsumed: cost,
      inputData: { studentId: student.id, studentName: student.name, period, versionNumber },
    });

    let raw: string;
    let serverDebited = false;
    try {
      const { result, creditsRemaining } = await callAIGateway({
        task: 'json', prompt,
        creditsRequired: cost,
        requestType: 'plano_acao',
        operationId,
      });
      raw = result;
      serverDebited = creditsRemaining !== undefined;
    } catch (e) {
      if (auditId) AiAuditService.completeRequest(auditId, { status: 'failed', latencyMs: Date.now() - t0, outputType: 'json', content: String(e) });
      throw e;
    }

    const cleaned = cleanJsonString(raw);
    let plan: import('../types').ActionPlanJSON;
    try {
      plan = JSON.parse(cleaned) as import('../types').ActionPlanJSON;
    } catch {
      if (auditId) AiAuditService.completeRequest(auditId, { status: 'failed', latencyMs: Date.now() - t0, outputType: 'json', content: 'JSON parse error' });
      throw new Error('Resposta da IA em formato inválido. Tente novamente.');
    }

    if (!serverDebited) await this.deductCredits(user, cost);
    if (auditId) AiAuditService.completeRequest(auditId, { status: 'success', latencyMs: Date.now() - t0, outputType: 'json', content: JSON.stringify(plan).slice(0, 300) });

    return plan;
  },

  // ── Plano de Ação AEE ─────────────────────────────────────────────────────────

  async generateAEEActionPlan(
    student: Student,
    user: User,
    period: import('../types').AEEActionPlanPeriod,
    paeeContent: string,
    versionNumber: number,
    operationId?: string,
  ): Promise<import('../types').AEEActionPlanJSON> {
    const cost = AI_CREDIT_COSTS.PLANO_ACAO_AEE;
    if (!(await this.checkCredits(user, cost))) {
      throw insufficientCreditsError(cost, await this.getCreditsBalance(user));
    }

    const missingData  = 'não há registro nos dados disponíveis';
    const diagnosis    = (student.diagnosis || []).join(', ') || missingData;
    const cid          = Array.isArray(student.cid) ? student.cid.join(', ') : (student.cid || '');
    const abilities    = (student.abilities || []).join('; ') || '';
    const difficulties = (student.difficulties || []).join('; ') || '';
    const strategies   = (student.strategies || []).join('; ') || '';

    // Sprint IA-9: contexto canônico montado pela Edge (buildContextServer=true).
    // O frontend NÃO faz mais as 11 queries — a Edge usa service_role e valida tenant.
    const pkBlock = buildPKBlock(student);

    const periodLabel =
      period === 'semanal'   ? 'SEMANAL (1 semana de atendimentos AEE)'   :
      period === 'quinzenal' ? 'QUINZENAL (2 semanas de atendimentos AEE)' :
      period === 'mensal'    ? 'MENSAL (próximo mês de atendimentos AEE)'  :
      period === 'bimestral' ? 'BIMESTRAL (próximo bimestre de atendimentos AEE)' :
      'SEMESTRAL (próximo semestre de atendimentos AEE)';

    const prompt = `Você é especialista em Atendimento Educacional Especializado (AEE) conforme a Resolução CNE/CEB nº 4/2009 e a Lei Brasileira de Inclusão (Lei 13.146/2015).

Sua tarefa: gerar um PLANO DE AÇÃO AEE — roteiro prático das sessões de Atendimento Educacional Especializado para o período ${periodLabel}. Este plano é o guia de campo do professor AEE na sala de recursos. Cada item deve ser executável durante o atendimento.

═══════════════════════════════════════
DADOS DO ALUNO
═══════════════════════════════════════
Nome: ${student.name}
Diagnóstico(s): ${diagnosis}${cid ? ` (CID: ${cid})` : ''}
Nível de Suporte: ${student.supportLevel || missingData}
Série/Turno: ${student.grade || missingData} / ${student.shift || missingData}
Professor AEE: ${student.aeeTeacher || missingData}
Professor Regente: ${student.regentTeacher || missingData}
Habilidades: ${abilities || missingData}
Dificuldades: ${difficulties || missingData}
Estratégias que funcionam: ${strategies || missingData}
Comunicação: ${(student.communication || []).join('; ') || missingData}
${pkBlock}
${paeeContent ? `\n═══ PAEE — DOCUMENTO NORTEADOR PRINCIPAL ═══\n${paeeContent}` : `\n═══ PAEE — DOCUMENTO NORTEADOR PRINCIPAL ═══\n${missingData}`}

═══════════════════════════════════════
REGRAS CRÍTICAS — LEIA ANTES DE GERAR
═══════════════════════════════════════
PROIBIDO — nunca gere frases genéricas como:
- "aplicar atividades lúdicas e inclusivas"
- "estimular o aluno de forma contextualizada"
- "usar materiais adaptados conforme necessidade"
- "promover interação e aprendizagem significativa"

OBRIGATÓRIO — substitua por ações concretas do AEE como:
- "Usar prancha de comunicação com 6 figuras: saudação, água, banheiro, pausa, não entendi, sim"
- "Iniciar sessão com rotina visual de 3 cartões: chegada → atividade → encerramento"
- "Jogo 'Memória das Letras' — embaralhar 12 pares, aluno escolhe e nomeia a letra encontrada"
- "Registrar: autônomo / com mediação verbal / com apoio físico / recusou / precisou de pausa"
- "Timer visual de 8 minutos para cada bloco de atividade"
- "Se recusar: oferecer escolha entre duas opções e aguardar 30 segundos antes de intervir"

FONTES E LIMITES DO PLANO AEE:
- O PAEE é a fonte principal. Use-o para definir barreira prioritária, objetivo do atendimento, recursos de acessibilidade, estratégias AEE e forma de acompanhamento.
- Se o PAEE estiver ausente, vazio ou incompleto, reconheça a ausência de dados suficientes e gere apenas orientações mínimas e cautelosas. Não invente plano completo.
- Cada ação deve se relacionar a barreira registrada, necessidade de acessibilidade, recurso indicado, observação pedagógica ou objetivo do PAEE.
- Objetivos: até 3, objetivos e observáveis.
- Ações/roteiro de atendimento: até 5 itens e somente quando houver dados suficientes.
- Recursos, jogos, vídeos, materiais, atividades impressas, recursos digitais e dinâmicas são opcionais. Gere somente quando houver evidência ou indicação no PAEE/contexto. Caso contrário, deixe o bloco com lista vazia ou omita o bloco opcional mantendo o JSON parseável.
- Materiais: até 5.
- Registros e acompanhamento: objetivos, sem afirmar evolução antes do atendimento.
- Não transformar este plano em currículo da sala comum. Não substituir PEI. Não prescrever terapia, conduta clínica ou intervenção médica.

FONTES: use o PAEE como norteador principal. Use Estudo de Caso, registros AEE, observações pedagógicas, laudos/documentos analisados, ficha cognitiva, Perfil Inteligente e atividades anteriores apenas como evidências complementares. Não use diagnóstico sozinho para deduzir barreira, recurso, frequência, suporte, estratégia ou evolução.
HISTÓRICO DE ATIVIDADES E ESTRATÉGIAS: Se o contexto incluir seção "ATIVIDADES PEDAGÓGICAS JÁ GERADAS", use o histórico para propor sequência pedagógica progressiva em "sessionScript" e "gamesResources" — nunca repetir atividades idênticas. Se houver seção "ESTRATÉGIAS QUE FUNCIONARAM", priorize-as em "welcomeRoutine" e nos recursos do atendimento. Se houver "ESTRATÉGIAS QUE EXIGEM CAUTELA", reflita isso na barreira prioritária e nas observações do plano.
REGRAS DE EVIDÊNCIA: Toda ação deve se apoiar em dado disponível. Se faltar evidência, use "${missingData}" ou lista vazia quando o schema permitir. Não invente diagnóstico, CID, terapia, medicação, acompanhamento externo, frequência, evolução, barreiras, recursos, jogos, vídeos, materiais, estratégias ou roteiro completo. Não fale de evolução sem registros temporais comparáveis. Não repita a mesma orientação em vários campos.
${FORBIDDEN_TERMS_BLOCK}

═══════════════════════════════════════
ESTRUTURA JSON OBRIGATÓRIA
═══════════════════════════════════════
Retorne SOMENTE o JSON abaixo. Preserve exatamente os nomes dos campos. Preencha campos e listas somente quando houver evidência suficiente para ${student.name}. Nunca repita itens entre blocos. Nenhum placeholder. Blocos opcionais podem ter "items": [] quando não houver base.

{
  "period": "${period}",
  "generatedAt": "${new Date().toISOString()}",
  "generatedBy": "${(user as any)?.id ?? ''}",
  "generatedByName": "${(user as any)?.name ?? (user as any)?.email ?? 'Profissional AEE'}",
  "registrationNumber": "",
  "version": ${versionNumber},

  "sessionObjective": "Objetivo prático do atendimento AEE neste período — máx. 2 linhas. Ex: Ampliar o uso da prancha de comunicação e consolidar o reconhecimento das letras do próprio nome com mediação decrescente.",

  "welcomeRoutine": {
    "title": "Acolhida e Rotina do AEE",
    "items": [
      { "id": "wr1", "text": "Como receber ${student.name} na chegada à sala de recursos — ritual específico", "done": false },
      { "id": "wr2", "text": "Como apresentar a rotina visual do dia — sequência de cartões, agenda ou prancha", "done": false },
      { "id": "wr3", "text": "Como reduzir resistência ou ansiedade inicial — estratégia específica para este aluno", "done": false },
      { "id": "wr4", "text": "Transição entre chegada e início da atividade — como fazer", "done": false },
      { "id": "wr5", "text": "Sinal ou combinado de início — ex: timer visual, cartão 'vamos começar'", "done": false }
    ]
  },

  "priorityBarrier": {
    "title": "Barreira Prioritária do Período",
    "items": [
      { "id": "pb1", "text": "Barreira principal identificada no PAEE/perfil: [descrição específica]", "done": false },
      { "id": "pb2", "text": "Como esta barreira se manifesta na sala de recursos AEE", "done": false },
      { "id": "pb3", "text": "Objetivo AEE específico para esta barreira neste período", "done": false },
      { "id": "pb4", "text": "Indicador observável de progresso — como saber se está avançando", "done": false }
    ]
  },

  "sessionScript": {
    "title": "Roteiro do Atendimento AEE",
    "items": [
      { "id": "ss1", "text": "Início (0-5 min): [o que fazer nos primeiros minutos]", "done": false },
      { "id": "ss2", "text": "Atividade principal (5-20 min): [atividade com nome, materiais e como conduzir]", "done": false },
      { "id": "ss3", "text": "Pausa de regulação (20-25 min): [como oferecer pausa — atividade sensorial, água, movimento]", "done": false },
      { "id": "ss4", "text": "Retomada (25-35 min): [segunda atividade ou continuação, foco e como conduzir]", "done": false },
      { "id": "ss5", "text": "Encerramento (35-40 min): [ritual de finalização — cartão 'ótimo trabalho', guardar materiais]", "done": false },
      { "id": "ss6", "text": "Registro (pós-sessão): [o que registrar sobre o atendimento — ficha, app, diário AEE]", "done": false }
    ]
  },

  "gamesResources": {
    "title": "Jogos Sugeridos para o AEE",
    "items": [
      { "id": "gr1", "text": "Jogo 1: [Nome do jogo] — Objetivo AEE: [o que trabalha] — Como usar na sala de recursos: [passo a passo]", "done": false },
      { "id": "gr2", "text": "Jogo 2: [Nome do jogo] — Objetivo AEE: [o que trabalha] — Como usar: [passo a passo]", "done": false },
      { "id": "gr3", "text": "Jogo 3 (opcional): [Nome] — Como usar: [passo a passo]", "done": false }
    ]
  },

  "videosResources": {
    "title": "Vídeos Sugeridos",
    "items": [
      { "id": "vr1", "text": "Tipo de vídeo: [conteúdo visual — ex: rotina social animada, história com CAA] — Duração: máx. 3 min — Quando exibir: [antes da atividade] — Objetivo AEE: [o que ajuda]", "done": false },
      { "id": "vr2", "text": "Tipo de vídeo 2 (opcional): [conteúdo] — Duração: máx. 3 min — Quando usar: [contexto]", "done": false }
    ]
  },

  "printedActivities": {
    "title": "Atividades Impressas Sugeridas",
    "items": [
      { "id": "pa1", "text": "Atividade impressa 1: [tipo — ex: ficha de sequência, jogo de associação] — Objetivo: [o que trabalha] — Como adaptar para ${student.name}", "done": false },
      { "id": "pa2", "text": "Atividade impressa 2 (opcional): [tipo] — Objetivo: [o que trabalha]", "done": false }
    ]
  },

  "digitalResources": {
    "title": "Atividade/Jogo no Computador",
    "items": [
      { "id": "dr1", "text": "Recurso digital: [nome ou tipo de app/site/jogo] — Objetivo AEE: [o que trabalha] — Como usar com ${student.name}: [instruções]", "done": false }
    ]
  },

  "dynamicsResources": {
    "title": "Dinâmicas Sugeridas",
    "items": [
      { "id": "dy1", "text": "Dinâmica 1: [nome] — Passos: 1) [passo] 2) [passo] 3) [passo] — Duração: [tempo] — Objetivo: [o que trabalha]", "done": false },
      { "id": "dy2", "text": "Dinâmica 2 (opcional): [nome] — Passos: [descrever] — Duração: [tempo]", "done": false }
    ]
  },

  "materials": {
    "title": "Materiais Necessários",
    "items": [
      { "id": "mt1", "text": "Material: [nome] — Como usar no AEE com ${student.name}: [instrução específica]", "done": false },
      { "id": "mt2", "text": "Material: [nome] — Como usar: [instrução]", "done": false },
      { "id": "mt3", "text": "Material: [nome] — Como usar: [instrução]", "done": false },
      { "id": "mt4", "text": "Material: [nome] — Como usar: [instrução]", "done": false },
      { "id": "mt5", "text": "Material: [nome] — Como usar: [instrução]", "done": false }
    ]
  },

  "applicationGuide": {
    "title": "Como Aplicar",
    "items": [
      { "id": "ag1", "text": "Instrução de aplicação 1 — ex: apresentar material antes de pedir resposta", "done": false },
      { "id": "ag2", "text": "Instrução de aplicação 2 — ex: usar frases curtas e vocabulário conhecido", "done": false },
      { "id": "ag3", "text": "Instrução de aplicação 3 — como lidar com recusa ou sobrecarga", "done": false },
      { "id": "ag4", "text": "Instrução de aplicação 4 — como usar apoio visual ou CAA durante a atividade", "done": false },
      { "id": "ag5", "text": "Instrução de aplicação 5 — pacing e tempo de espera antes de intervir", "done": false }
    ]
  },

  "adaptationsGuide": {
    "title": "Como Adaptar",
    "items": [
      { "id": "adg1", "text": "Adaptação 1: se o aluno apresentar dificuldade — [o que fazer]", "done": false },
      { "id": "adg2", "text": "Adaptação 2: se o aluno concluir rapidamente — [como avançar]", "done": false },
      { "id": "adg3", "text": "Adaptação 3: se houver sobrecarga sensorial — [como reagir]", "done": false },
      { "id": "adg4", "text": "Adaptação 4: reduzir complexidade — ex: de 6 para 3 opções", "done": false }
    ]
  },

  "responseRecord": {
    "title": "Como Registrar a Resposta do Aluno",
    "items": [
      { "id": "rr1", "text": "Realizou com autonomia", "done": false },
      { "id": "rr2", "text": "Realizou com mediação verbal", "done": false },
      { "id": "rr3", "text": "Precisou de apoio visual (prancha, cartão, imagem)", "done": false },
      { "id": "rr4", "text": "Necessitou de pausa durante a atividade", "done": false },
      { "id": "rr5", "text": "Demonstrou interesse e engajamento ativo", "done": false },
      { "id": "rr6", "text": "Apresentou resistência ou recusa inicial", "done": false },
      { "id": "rr7", "text": "Generalizou parcialmente a habilidade trabalhada", "done": false },
      { "id": "rr8", "text": "Precisou de apoio físico ou gestual constante", "done": false }
    ]
  },

  "nextStep": "Próximo passo concreto para o AEE — ex: Avançar para comunicação com 8 figuras / Introduzir leitura silábica na próxima sessão / Relatar evolução ao professor regente / Conversar com família sobre continuidade em casa"
}

IMPORTANTE: substitua os textos de exemplo por ações reais e específicas para ${student.name} com base principalmente no PAEE e nas evidências disponíveis. Use diagnóstico apenas como dado registrado, nunca como motor das ações. Nunca repita item entre blocos. Português brasileiro formal.`;

    const t0 = Date.now();
    const auditId = await AiAuditService.logRequest({
      tenantId: (user as any).tenant_id ?? '', userId: user.id,
      requestType: 'plano_acao_aee', model: 'gemini-2.5-flash',
      creditsConsumed: cost,
      inputData: { studentId: student.id, studentName: student.name, period, versionNumber },
    });

    let raw: string;
    let serverDebited = false;
    try {
      const { result, creditsRemaining } = await callAIGateway({
        task: 'json', prompt,
        creditsRequired: cost,
        requestType: 'plano_acao_aee',
        operationId,
        // Sprint IA-9: Edge monta contexto canônico via service_role
        studentId:          student.id,
        buildContextServer: true,
        targetDocType:      'plano_acao_aee',
      });
      raw = result;
      serverDebited = creditsRemaining !== undefined;
    } catch (e) {
      if (auditId) AiAuditService.completeRequest(auditId, { status: 'failed', latencyMs: Date.now() - t0, outputType: 'json', content: String(e) });
      throw e;
    }

    const cleaned = cleanJsonString(raw);
    let plan: import('../types').AEEActionPlanJSON;
    try {
      plan = JSON.parse(cleaned) as import('../types').AEEActionPlanJSON;
    } catch {
      if (auditId) AiAuditService.completeRequest(auditId, { status: 'failed', latencyMs: Date.now() - t0, outputType: 'json', content: 'JSON parse error' });
      throw new Error('Resposta da IA em formato inválido. Tente novamente.');
    }

    if (!serverDebited) await this.deductCredits(user, cost);
    if (auditId) AiAuditService.completeRequest(auditId, { status: 'success', latencyMs: Date.now() - t0, outputType: 'json', content: JSON.stringify(plan).slice(0, 300) });

    return plan;
  },
};
