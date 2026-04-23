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
  if (raw.includes('Failed to fetch') || raw.includes('NetworkError') || (e as any)?.name === 'TypeError')
    return 'Falha de conexão com o serviço de IA. Verifique sua internet e tente novamente.';
  if (raw.includes('quota') || raw.includes('429') || raw.includes('rate limit'))
    return 'Limite de uso da IA atingido. Aguarde alguns instantes e tente novamente.';
  if (raw.includes('Tempo de resposta') || raw.includes('AbortError'))
    return 'A IA demorou demais para responder. Tente novamente.';
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

    const isPEI = String(type).toUpperCase().includes('PEI');
    const isEstudoCaso = String(type).toUpperCase().replace(/\s/g, '_').includes('ESTUDO');

    let prompt: string;

    if (isPEI) {
      prompt = `Você é psicopedagogo especialista em educação inclusiva e elaboração de PEI (Plano Educacional Individualizado).

${studentDataBlock}

REGRAS OBRIGATÓRIAS:
- Nunca gere texto genérico. Todo conteúdo deve refletir o diagnóstico e perfil real do aluno.
- Use linguagem técnica, objetiva e profissional.
- Baseie objetivos, estratégias e critérios nas habilidades e dificuldades específicas informadas.
- Conecte as estratégias ao diagnóstico: o que funciona para TEA pode diferir do que funciona para DI.

RETORNE SOMENTE o JSON válido abaixo, sem texto adicional, sem markdown:
{
  "sections": [
    {
      "id": "identificacao",
      "title": "Identificação do Aluno",
      "fields": [
        { "id": "nome", "label": "Nome completo", "type": "text", "value": "${student.name}" },
        { "id": "diagnostico", "label": "Diagnóstico(s) / CID", "type": "text", "value": "${diagnosis}" },
        { "id": "suporte", "label": "Nível de Suporte", "type": "text", "value": "${student.supportLevel || 'A definir'}" },
        { "id": "vigencia", "label": "Vigência do PEI", "type": "text", "value": "Ano letivo atual" },
        { "id": "objetivo_geral", "label": "Objetivo Geral do PEI", "type": "textarea", "value": "Descreva o objetivo geral personalizado ao perfil do aluno" }
      ]
    },
    {
      "id": "portugues",
      "title": "Língua Portuguesa",
      "fields": [
        { "id": "pt_objetivo", "label": "Objetivo", "type": "textarea", "value": "Objetivo específico e mensurável para Língua Portuguesa, conectado às dificuldades do aluno" },
        { "id": "pt_estrategia", "label": "Estratégia", "type": "textarea", "value": "Estratégias pedagógicas adaptadas ao diagnóstico e nível de suporte do aluno" },
        { "id": "pt_frequencia", "label": "Frequência", "type": "text", "value": "Ex: 3 vezes por semana, 45 minutos por sessão" },
        { "id": "pt_criterio", "label": "Critério de Avaliação", "type": "textarea", "value": "Como será avaliado o alcance do objetivo — indicadores observáveis e mensuráveis" }
      ]
    },
    {
      "id": "matematica",
      "title": "Matemática",
      "fields": [
        { "id": "mt_objetivo", "label": "Objetivo", "type": "textarea", "value": "Objetivo específico e mensurável para Matemática, baseado nas habilidades e dificuldades do aluno" },
        { "id": "mt_estrategia", "label": "Estratégia", "type": "textarea", "value": "Estratégias concretas e adaptadas (materiais manipuláveis, sequenciação, etc.)" },
        { "id": "mt_frequencia", "label": "Frequência", "type": "text", "value": "Ex: 2 vezes por semana, 45 minutos por sessão" },
        { "id": "mt_criterio", "label": "Critério de Avaliação", "type": "textarea", "value": "Indicadores observáveis de progresso para Matemática" }
      ]
    },
    {
      "id": "ciencias",
      "title": "Ciências",
      "fields": [
        { "id": "ci_objetivo", "label": "Objetivo", "type": "textarea", "value": "Objetivo específico para Ciências, adaptado ao nível cognitivo e diagnóstico do aluno" },
        { "id": "ci_estrategia", "label": "Estratégia", "type": "textarea", "value": "Estratégias visuais, experimentais ou concretas adequadas ao perfil do aluno" },
        { "id": "ci_frequencia", "label": "Frequência", "type": "text", "value": "Ex: 1 vez por semana integrada às aulas regulares" },
        { "id": "ci_criterio", "label": "Critério de Avaliação", "type": "textarea", "value": "Indicadores de compreensão e participação em Ciências" }
      ]
    },
    {
      "id": "geografia",
      "title": "Geografia",
      "fields": [
        { "id": "ge_objetivo", "label": "Objetivo", "type": "textarea", "value": "Objetivo específico para Geografia, conectado ao contexto e capacidade de abstração do aluno" },
        { "id": "ge_estrategia", "label": "Estratégia", "type": "textarea", "value": "Uso de mapas, imagens, recursos concretos e rotina visual adequados ao diagnóstico" },
        { "id": "ge_frequencia", "label": "Frequência", "type": "text", "value": "Ex: 1 vez por semana integrada às aulas regulares" },
        { "id": "ge_criterio", "label": "Critério de Avaliação", "type": "textarea", "value": "Indicadores observáveis de compreensão espacial e participação em Geografia" }
      ]
    },
    {
      "id": "acompanhamento",
      "title": "Acompanhamento e Revisão",
      "fields": [
        { "id": "responsaveis", "label": "Responsáveis pela execução", "type": "text", "value": "${student.aeeTeacher ? `Prof. AEE: ${student.aeeTeacher}` : 'Professor AEE e Professor Regente'}" },
        { "id": "revisao", "label": "Periodicidade de revisão do PEI", "type": "text", "value": "Bimestral ou conforme necessidade da equipe" },
        { "id": "familia", "label": "Orientações para a família", "type": "textarea", "value": "Orientações práticas para reforço domiciliar alinhadas ao diagnóstico e às metas do PEI" },
        { "id": "obs", "label": "Observações adicionais", "type": "textarea", "value": "Informações complementares relevantes para a equipe pedagógica" }
      ]
    }
  ]
}

Preencha TODOS os campos value com conteúdo real, técnico e específico ao aluno. Português brasileiro formal.`;
    } else if (isEstudoCaso) {
      prompt = `Você é psicopedagogo especialista em educação inclusiva e elaboração de Estudos de Caso.

${studentDataBlock}

REGRAS OBRIGATÓRIAS:
- Nunca gere texto genérico. Todo conteúdo deve refletir os dados reais do aluno.
- Analise interpretativamente: não descreva, interprete o significado para o desenvolvimento.
- Use evidências temporais (datas, frequência, evolução) sempre que disponíveis.
- Conecte laudos, histórico, comportamento e desempenho entre si.
- Identifique padrões: o que avança, o que regride, em quais condições.
- Linguagem técnica, objetiva e profissional. Nunca capacitista.

RETORNE SOMENTE o JSON válido abaixo, sem texto adicional, sem markdown:
{
  "sections": [
    {
      "id": "sec1",
      "title": "Nome da Seção",
      "fields": [
        { "id": "f1", "label": "Nome do Campo", "type": "textarea", "value": "Conteúdo técnico e específico ao aluno..." }
      ]
    }
  ]
}

Estrutura obrigatória — gere exatamente estas seções:
1. Identificação e Contexto Geral
2. Análise dos Laudos e Documentos Clínicos (interpretativa, não descritiva)
3. Linha do Tempo dos Atendimentos (com padrões de frequência, faltas e impacto)
4. Análise Cognitiva e Conexão com a Prática Pedagógica
5. Identificação de Padrões (evolução, regressão, estabilidade)
6. Parecer Técnico e Recomendações

Cada seção: 2 a 5 campos. Preencha todos os valores com conteúdo real e técnico. Português brasileiro formal.`;
    } else {
      prompt = `Você é especialista em educação inclusiva e documentação pedagógica brasileira.
Gere um documento completo do tipo "${docLabel}" para o aluno abaixo.

${studentDataBlock}

RETORNE SOMENTE o JSON válido abaixo, sem texto adicional, sem markdown:
{
  "sections": [
    {
      "id": "sec1",
      "title": "Nome da Seção",
      "fields": [
        { "id": "f1", "label": "Nome do Campo", "type": "textarea", "value": "Conteúdo..." }
      ]
    }
  ]
}

Regras: type "textarea" para textos longos, type "text" para valores curtos.
Mínimo 4 seções, máximo 8. Cada seção: 2 a 5 campos. Português brasileiro formal.
Baseie-se nas melhores práticas de educação inclusiva e na LDBEN/Lei Brasileira de Inclusão.`;
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
    if (canonicalCtx) {
      try {
        const { output } = await CanonicalStudentContextService.validateAndRepair(
          prompt, jsonResult, mapDocTypeToCategory(String(type)), canonicalCtx,
        );
        jsonResult = output;
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
