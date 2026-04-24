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
} from '../types';
import { AI_CREDIT_COSTS, INCLUILAB_MODEL_COSTS, CREDIT_INSUFFICIENT_MSG } from '../config/aiCosts';
import { AiAuditService } from './persistenceService';
import type { StudentContext } from './studentContextService';
import { StudentContextService } from './studentContextService';
import { callAIGateway } from './aiGatewayService';
import {
  CanonicalStudentContextService,
  mapDocTypeToCategory,
  type CanonicalStudentContext,
} from './canonicalStudentContext';

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
};

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

// Bloco interpretado de contexto familiar — interpreta, não transcreve
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
  return `\nCONTEXTO FAMILIAR (interprete — não transcreva literalmente; use para embasar recomendações à família):\n${lines.join('\n')}\nINSTRUÇÃO: A fala da família deve ser interpretada à luz do diagnóstico. Identifique percepções relevantes, lacunas de informação e pontos que precisam de orientação profissional.\n`;
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
  async deductCredits(user: User, action: string, cost: number): Promise<void> {
    if (!user?.tenant_id) return;
    try {
      const tenantId = (user as any).tenant_id;
      const userId   = (user as any).id ?? null;

      const { data: wallet, error: readErr } = await supabase
        .from('credits_wallet').select('id, balance')
        .eq('tenant_id', tenantId).maybeSingle();
      if (readErr) console.warn('[AIService] deductCredits read error:', readErr.message);

      if (wallet) {
        const next = Math.max(0, Number((wallet as any).balance ?? 0) - cost);
        const { error: upErr } = await supabase
          .from('credits_wallet')
          .update({ balance: next, updated_at: new Date().toISOString() })
          .eq('id', (wallet as any).id);
        if (upErr) console.warn('[AIService] deductCredits update error:', upErr.message);
      }

      const { error: ledgerErr } = await supabase.from('credits_ledger').insert({
        tenant_id: tenantId, user_id: userId,
        type: 'usage_ai', amount: -cost, description: 'IA: ' + action,
      });
      if (ledgerErr) console.warn('[AIService] credits_ledger insert error:', ledgerErr.message);
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
    const prompt = `Gere o protocolo ${type} para ${student.name}. Diagnóstico: ${student.diagnosis.join(', ')}. Nível de suporte: ${student.supportLevel}.${promptAppend}`;

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

  async generateProtocolJSON(type: any, student: Student, user: User, studentContext?: StudentContext): Promise<string> {
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
    const diagnosis    = (student.diagnosis || []).join(', ') || 'Não informado';
    const cid          = Array.isArray(student.cid) ? student.cid.join(', ') : (student.cid || 'Não informado');
    const abilities    = (student.abilities || []).join('; ') || 'Não informado';
    const difficulties = (student.difficulties || []).join('; ') || 'Não informado';
    const strategies   = (student.strategies || []).join('; ') || 'Não informado';

    // Contexto canônico — fonte única de verdade para todos os documentos
    let ctxBlock = '';
    let canonicalCtx: CanonicalStudentContext | null = null;
    try {
      canonicalCtx = await CanonicalStudentContextService.buildCanonicalContext(student);
      if (CanonicalStudentContextService.hasData(canonicalCtx)) {
        ctxBlock = CanonicalStudentContextService.toPromptText(canonicalCtx, mapDocTypeToCategory(String(type)));
      }
    } catch {
      // Fallback ao contexto legado se o canônico falhar
      if (studentContext && StudentContextService.hasData(studentContext)) {
        ctxBlock = StudentContextService.toPromptText(studentContext);
      } else if (student.id) {
        try {
          const autoCtx = await StudentContextService.buildContext(student.id);
          if (StudentContextService.hasData(autoCtx)) ctxBlock = StudentContextService.toPromptText(autoCtx);
        } catch { /* contexto é opcional */ }
      }
    }

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

IMPORTANTE: "Nome do aluno" refere-se APENAS ao estudante. "Responsável legal" é o adulto guardião. Nunca confunda essas identidades.

${ctxBlock}`;

    const typeUpper   = String(type).toUpperCase().replace(/\s+/g, '_');
    const isPEI       = typeUpper.includes('PEI');
    const isEstudoCaso = typeUpper.includes('ESTUDO');
    const isPAEE      = typeUpper.includes('PAEE');
    const isPDI       = typeUpper.includes('PDI');

    const familyBlock = buildFamilyBlock(student);

    let prompt: string;

    // ── PEI ─────────────────────────────────────────────────────────────────────
    if (isPEI) {
      prompt = `Você é psicopedagogo especialista em Plano Educacional Individualizado (PEI) conforme a Lei Brasileira de Inclusão (Lei 13.146/2015) e a Política Nacional de Educação Especial na Perspectiva da Educação Inclusiva.

FINALIDADE DO PEI: Instrumento pedagógico que traduz o diagnóstico em metas anuais mensuráveis, por disciplina, com estratégias adaptadas ao perfil real do aluno e critérios claros de avaliação. Não é relatório — é plano de ação.

${studentDataBlock}
${familyBlock}

REGRAS DE GERAÇÃO — aplique a cada campo:
1. Cada objetivo deve ser SMART: específico, mensurável, atingível, relevante e com prazo implícito (anual).
2. Cada estratégia deve citar recursos concretos ligados ao diagnóstico (ex: para TEA — sequências visuais, antecipação; para DI — atividades em etapas, repetição; para TDAH — tarefas curtas, pausas estruturadas).
3. Se há Perfil Pedagógico Inicial no contexto, use os scores para calibrar o nível de complexidade de cada objetivo.
4. Critérios de avaliação devem ser comportamentos OBSERVÁVEIS (nunca "melhorar", sempre "identificar", "escrever", "resolver", "completar").
5. A seção de família deve ser orientação prática de reforço domiciliar — não instrução clínica.
6. Nunca repita o mesmo texto entre disciplinas. Cada seção deve ter conteúdo diferenciado.
7. Linguagem técnica formal. Português brasileiro. Sem "não informado".

RETORNE SOMENTE o JSON válido. Os campos "value" devem conter o conteúdo REAL gerado — não instruções nem placeholders:
{
  "sections": [
    {
      "id": "identificacao",
      "title": "Identificação do Aluno",
      "fields": [
        { "id": "nome", "label": "Nome completo", "type": "text", "value": "${student.name}" },
        { "id": "diagnostico", "label": "Diagnóstico(s) / CID", "type": "text", "value": "${diagnosis}" },
        { "id": "suporte", "label": "Nível de Suporte", "type": "text", "value": "${student.supportLevel || 'A definir com equipe multidisciplinar'}" },
        { "id": "vigencia", "label": "Vigência do PEI", "type": "text", "value": "Ano letivo ${new Date().getFullYear()}" },
        { "id": "objetivo_geral", "label": "Objetivo Geral do PEI", "type": "textarea", "value": "" }
      ]
    },
    {
      "id": "portugues",
      "title": "Língua Portuguesa",
      "fields": [
        { "id": "pt_objetivo", "label": "Objetivo anual", "type": "textarea", "value": "" },
        { "id": "pt_estrategia", "label": "Estratégias e recursos", "type": "textarea", "value": "" },
        { "id": "pt_frequencia", "label": "Frequência de atendimento", "type": "text", "value": "" },
        { "id": "pt_criterio", "label": "Critério de avaliação", "type": "textarea", "value": "" }
      ]
    },
    {
      "id": "matematica",
      "title": "Matemática",
      "fields": [
        { "id": "mt_objetivo", "label": "Objetivo anual", "type": "textarea", "value": "" },
        { "id": "mt_estrategia", "label": "Estratégias e recursos", "type": "textarea", "value": "" },
        { "id": "mt_frequencia", "label": "Frequência de atendimento", "type": "text", "value": "" },
        { "id": "mt_criterio", "label": "Critério de avaliação", "type": "textarea", "value": "" }
      ]
    },
    {
      "id": "ciencias",
      "title": "Ciências",
      "fields": [
        { "id": "ci_objetivo", "label": "Objetivo anual", "type": "textarea", "value": "" },
        { "id": "ci_estrategia", "label": "Estratégias e recursos", "type": "textarea", "value": "" },
        { "id": "ci_frequencia", "label": "Frequência de atendimento", "type": "text", "value": "" },
        { "id": "ci_criterio", "label": "Critério de avaliação", "type": "textarea", "value": "" }
      ]
    },
    {
      "id": "geografia",
      "title": "Geografia",
      "fields": [
        { "id": "ge_objetivo", "label": "Objetivo anual", "type": "textarea", "value": "" },
        { "id": "ge_estrategia", "label": "Estratégias e recursos", "type": "textarea", "value": "" },
        { "id": "ge_frequencia", "label": "Frequência de atendimento", "type": "text", "value": "" },
        { "id": "ge_criterio", "label": "Critério de avaliação", "type": "textarea", "value": "" }
      ]
    },
    {
      "id": "acompanhamento",
      "title": "Acompanhamento e Família",
      "fields": [
        { "id": "responsaveis", "label": "Responsáveis pela execução", "type": "text", "value": "${student.aeeTeacher ? `Prof. AEE: ${student.aeeTeacher}` : 'Professor AEE e Professor Regente'}" },
        { "id": "revisao", "label": "Periodicidade de revisão", "type": "text", "value": "" },
        { "id": "familia", "label": "Orientações práticas para a família", "type": "textarea", "value": "" },
        { "id": "obs", "label": "Observações da equipe", "type": "textarea", "value": "" }
      ]
    }
  ]
}

Preencha TODOS os campos "value" com conteúdo real gerado a partir dos dados do aluno. Nenhum campo deve ficar vazio ou com texto genérico. Português brasileiro formal.`;

    // ── PAEE ─────────────────────────────────────────────────────────────────────
    } else if (isPAEE) {
      prompt = `Você é especialista em Plano de Atendimento Educacional Especializado (PAEE) conforme a Resolução CNE/CEB nº 4/2009 e a Nota Técnica nº 11/2010 do MEC/SEESP.

FINALIDADE DO PAEE: Documento técnico que define os recursos de acessibilidade, as adaptações de acessibilidade e as estratégias de inclusão necessárias para que o aluno com deficiência participe de forma plena do ambiente escolar. Foco em ACESSIBILIDADE, não em conteúdo curricular (isso é o PEI).

${studentDataBlock}
${familyBlock}

REGRAS DE GERAÇÃO:
1. Distinguir claramente: PAEE é sobre COMO o aluno acessa o ambiente e o currículo — não sobre O QUE ele aprende.
2. Cada adaptação deve especificar: (a) o recurso ou estratégia, (b) a barreira que remove, (c) quem é responsável pela implementação.
3. Tecnologia Assistiva: cite recursos concretos e gratuitos ou acessíveis ao contexto público (ex: CAA, pranchas de comunicação, leitores de tela, materiais em Braille, software de acessibilidade).
4. Não repita o diagnóstico como se fosse limitação — foque nas barreiras ambientais que precisam ser removidas.
5. Inclua adaptações para: ambiente físico, comunicação, material didático, avaliação, interação social.
6. Se há perfil cognitivo ou laudos no contexto, use para justificar cada adaptação proposta.
7. A seção de família deve orientar como reforçar a comunicação aumentativa ou estratégias de inclusão no contexto domiciliar.

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

Preencha TODOS os campos "value" com conteúdo real. Cada adaptação deve ser concreta, justificada e implementável. Português brasileiro formal.`;

    // ── PDI ─────────────────────────────────────────────────────────────────────
    } else if (isPDI) {
      prompt = `Você é psicopedagogo especialista em Plano de Desenvolvimento Individual (PDI) para educação inclusiva.

FINALIDADE DO PDI: Documento abrangente que integra metas de desenvolvimento global do aluno — cognitivo, social, emocional, comunicativo e pedagógico — em perspectiva longitudinal. Combina o que o PEI define para o currículo com o que o PAEE define para acessibilidade, acrescentando metas de desenvolvimento pessoal e familiar.

${studentDataBlock}
${familyBlock}

REGRAS DE GERAÇÃO:
1. O PDI deve ter profundidade interpretativa — analise padrões, não apenas descreva situações.
2. Use dados temporais sempre que disponíveis: datas de atendimento, evolução ao longo do tempo, padrões de frequência.
3. Cada meta deve ter: situação atual (baseline) → meta de período → indicador de alcance.
4. Conecte explicitamente: perfil cognitivo → metas de desenvolvimento → estratégias → papel da família.
5. Inclua análise do contexto familiar como fator de suporte ou risco — não apenas como informação neutra.
6. Identifique PADRÕES: o que o aluno avança, o que regride, sob quais condições cada um ocorre.
7. Mencione outros profissionais que acompanham o aluno e como articular o trabalho (fonoaudiologia, psicologia, TO).
8. Linguagem técnica formal. Nunca capacitista. Português brasileiro.

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

Preencha TODOS os campos "value" com conteúdo real e técnico baseado nos dados do aluno. Português brasileiro formal.`;

    // ── Estudo de Caso ────────────────────────────────────────────────────────────
    } else if (isEstudoCaso) {
      prompt = `Você é psicopedagogo especialista em elaboração de Estudos de Caso para educação inclusiva, com domínio em análise interpretativa de dados clínicos e pedagógicos.

FINALIDADE DO ESTUDO DE CASO: Documento técnico-científico que integra e interpreta — de forma longitudinal — todos os dados disponíveis sobre o aluno. Destina-se a equipes multidisciplinares, órgãos de saúde (CAPS, CRAS, APAE), secretarias de educação e, quando necessário, ao sistema judiciário. Não é relatório de progresso — é análise interpretativa profunda.

${studentDataBlock}
${familyBlock}

REGRAS DE GERAÇÃO — aplique rigorosamente:
1. ANALISE, não descreva. "Apresenta dificuldade na leitura" é descrição. "A dificuldade na decodificação fonológica observada compromete o acesso ao conteúdo curricular e se intensifica em contextos de avaliação formal" é análise.
2. USE a linha do tempo. Se há dados de atendimento no contexto, cite-os explicitamente: datas, padrões, faltas, impacto das ausências no progresso.
3. INTERPRETE os laudos. Não transcreva — explique o que o diagnóstico implica pedagogicamente.
4. IDENTIFIQUE padrões: o que evolui, o que regride, em quais condições cada movimento ocorre.
5. INTEGRE perspectiva familiar: a fala dos responsáveis deve ser interpretada, não transcrita. O que ela revela sobre percepção parental? Há lacunas? Há pontos de resistência ou de apoio?
6. CONECTE dados entre si: o perfil cognitivo deve dialogar com os laudos, que devem dialogar com as fichas de observação.
7. Nunca use frases genéricas. Cada parágrafo deve conter informação específica do aluno.
8. Linguagem técnico-científica. Português brasileiro formal.

RETORNE SOMENTE o JSON válido com estas seções obrigatórias:
{
  "sections": [
    { "id": "identificacao", "title": "Identificação e Contexto Geral", "fields": [
      { "id": "id_dados", "label": "Dados de identificação", "type": "text", "value": "${student.name} — ${diagnosis} — ${student.supportLevel || 'Suporte a definir'}" },
      { "id": "id_contexto", "label": "Contexto escolar e clínico atual", "type": "textarea", "value": "" },
      { "id": "id_demanda", "label": "Demanda que originou o Estudo de Caso", "type": "textarea", "value": "" }
    ]},
    { "id": "laudos", "title": "Análise Interpretativa dos Laudos e Documentos Clínicos", "fields": [
      { "id": "lau_analise", "label": "Interpretação clínico-pedagógica dos laudos disponíveis", "type": "textarea", "value": "" },
      { "id": "lau_implicacoes", "label": "Implicações pedagógicas do diagnóstico — o que muda na prática", "type": "textarea", "value": "" },
      { "id": "lau_lacunas", "label": "Lacunas diagnósticas ou documentais identificadas", "type": "textarea", "value": "" }
    ]},
    { "id": "timeline", "title": "Linha do Tempo dos Atendimentos e Evolução", "fields": [
      { "id": "tl_frequencia", "label": "Padrão de frequência: atendimentos, faltas e tendências", "type": "textarea", "value": "" },
      { "id": "tl_evolucao", "label": "Evolução observada ao longo dos atendimentos", "type": "textarea", "value": "" },
      { "id": "tl_impacto", "label": "Impacto das ausências ou interrupções no progresso pedagógico", "type": "textarea", "value": "" }
    ]},
    { "id": "cognitivo", "title": "Análise Cognitiva e Conexão com a Prática Pedagógica", "fields": [
      { "id": "cog_perfil", "label": "Interpretação do perfil cognitivo multidimensional", "type": "textarea", "value": "" },
      { "id": "cog_conexao", "label": "Como o perfil cognitivo se manifesta no cotidiano escolar", "type": "textarea", "value": "" },
      { "id": "cog_potencial", "label": "Dimensões preservadas e potencialidades identificadas", "type": "textarea", "value": "" }
    ]},
    { "id": "familia_ec", "title": "Análise do Contexto Familiar", "fields": [
      { "id": "fam_perspectiva", "label": "Perspectiva familiar: o que revelam e o que omitem", "type": "textarea", "value": "" },
      { "id": "fam_suporte", "label": "Nível de suporte familiar ao desenvolvimento do aluno", "type": "textarea", "value": "" }
    ]},
    { "id": "padroes", "title": "Identificação de Padrões", "fields": [
      { "id": "pad_avanca", "label": "O que avança e sob quais condições", "type": "textarea", "value": "" },
      { "id": "pad_regride", "label": "O que regride ou estabiliza e por quê", "type": "textarea", "value": "" }
    ]},
    { "id": "parecer", "title": "Parecer Técnico e Recomendações", "fields": [
      { "id": "par_conclusao", "label": "Parecer técnico conclusivo", "type": "textarea", "value": "" },
      { "id": "par_pedagogicas", "label": "Recomendações pedagógicas prioritárias", "type": "textarea", "value": "" },
      { "id": "par_clinicas", "label": "Recomendações clínicas e encaminhamentos", "type": "textarea", "value": "" },
      { "id": "par_institucionais", "label": "Recomendações institucionais e intersetoriais", "type": "textarea", "value": "" }
    ]}
  ]
}

Preencha TODOS os campos "value" com análise real, técnica e específica. Português brasileiro formal.`;

    // ── Genérico (FICHA, outros tipos) ───────────────────────────────────────────
    } else {
      prompt = `Você é especialista em educação inclusiva e documentação pedagógica brasileira conforme a Lei Brasileira de Inclusão (Lei 13.146/2015) e diretrizes do MEC.

Gere o documento pedagógico do tipo "${docLabel}" para o aluno abaixo. Este documento será usado por equipes escolares, famílias e profissionais de saúde.

${studentDataBlock}
${familyBlock}

REGRAS:
1. Nunca gere texto genérico. Todo conteúdo deve partir dos dados reais fornecidos.
2. Se a fala da família estiver disponível, interprete-a — não transcreva.
3. Linguagem técnica formal, sem "não informado". Se um dado estiver ausente, infira a partir do diagnóstico.
4. Mínimo 4 seções, máximo 8. Cada seção: 2 a 5 campos.

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

Preencha TODOS os "value" com conteúdo gerado. Português brasileiro formal.`;
    }

    let jsonResult: string;
    let serverDebited = false;
    try {
      const { result, creditsRemaining } = await callAIGateway({
        task: 'json', prompt,
        creditsRequired: cost,
        requestType: `protocol_${String(type).toLowerCase()}`,
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
      if (!serverDebited) await this.deductCredits(user, type, Math.floor(cost / 2));
      if (auditId) AiAuditService.completeRequest(auditId, { status: 'failed', latencyMs: Date.now() - t0, outputType: 'json', content: 'parse_error_fallback' });
      return JSON.stringify(fallback);
    }

    if (!serverDebited) await this.deductCredits(user, type, cost);
    if (auditId) AiAuditService.completeRequest(auditId, { status: 'success', latencyMs: Date.now() - t0, outputType: 'json', content: jsonResult.slice(0, 500) });
    return jsonResult;
  },

  // ── Análise de documento ────────────────────────────────────────────────────

  async analyzeDocument(name: string, _urlOrBase64: string | undefined, student: Student, user: User): Promise<any> {
    const cost = CREDIT_COSTS.ANALISE_DOCUMENTO;
    if (!(await this.checkCredits(user, cost))) {
      throw insufficientCreditsError(cost, await this.getCreditsBalance(user));
    }

    const diagnosis = (student.diagnosis || []).join(', ') || 'Não informado';
    const prompt = `Você é especialista em educação inclusiva. Analise o documento "${name}" do aluno ${student.name}.

Dados do aluno:
- Diagnóstico(s): ${diagnosis}
- Nível de Suporte: ${student.supportLevel || 'Não informado'}
- CID: ${Array.isArray(student.cid) ? student.cid.join(', ') : (student.cid || '—')}

Gere uma análise pedagógica completa. RETORNE SOMENTE o JSON válido:
{
  "id": "ANALISE-${Date.now()}",
  "documentName": "${name}",
  "date": "${new Date().toLocaleDateString('pt-BR')}",
  "synthesis": "Síntese detalhada...",
  "pedagogicalPoints": ["ponto 1", "ponto 2", "ponto 3"],
  "suggestions": ["sugestão 1", "sugestão 2"],
  "auditCode": "DOC-${Date.now()}"
}`;

    try {
      const { result, creditsRemaining } = await callAIGateway({
        task: 'json', prompt,
        creditsRequired: cost,
        requestType: 'analyze_document',
      });
      if (creditsRemaining === undefined) await this.deductCredits(user, 'ANALISE_DOCUMENTO', cost);
      return JSON.parse(result);
    } catch {
      await this.deductCredits(user, 'ANALISE_DOCUMENTO', cost);
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
${pkBlock}${asTeacher ? formatTeacher : ''}
Formato OBRIGATÓRIO (use Markdown):
# [Título curto da atividade]
## Objetivo (1–2 linhas)
## Materiais (lista curta)
## Instruções para o aluno (5–8 linhas)
## Adaptações / Acessibilidade (3–6 bullets)
## Avaliação rápida (rubrica 0–2)
## Observações (2–4 linhas, opcional)

Linguagem direta, adequada ao aluno e à família.
Se BNCC estiver vazio, sugira **1–2** códigos plausíveis marcados como "Sugestão".`;

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

    const prompt = `Você é uma pedagoga especialista em AEE e educação inclusiva brasileira.

Crie uma atividade pedagógica adaptada para o aluno descrito abaixo.

DADOS DO ALUNO:
- Nome: ${student.name}
- Diagnóstico(s): ${diagnosis}
- Nível de suporte: ${student.supportLevel || 'Não informado'}
- Ano/Série: ${grade}
- Disciplina: ${discipline}
${period ? `- Período/Unidade: ${period}` : ''}
${bncc ? `- BNCC: ${bncc}` : ''}
${pkBlockStructured}

TEMA: ${topic}

REGRAS: Idioma SOMENTE português do Brasil. Mínimo 4 questões, máximo 8.

RETORNE SOMENTE o JSON:
{
  "titulo": "...", "subtitulo": "...", "instrucao": "...", "objetivo": "...",
  "questoes": ["questão 1", "questão 2"],
  "observacao_professor": "...", "nivel_dificuldade": "Fácil | Médio | Difícil"
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

    const basePrompt = `Analise o documento enviado (tipo ${docType}) e extraia dados úteis para educação inclusiva do aluno ${student.name}.
Retorne JSON com: resumo, achados, recomendações, sinais de alerta, e sugestões de adaptações.`;

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
};
