// aiService.ts
import { GoogleGenerativeAI } from "@google/generative-ai";
import { GoogleGenAI, Modality } from "@google/genai";
import { supabase } from "./supabase";
import { User, DocumentType, Student, DocumentAnalysis, AIModelConfig, AIModelContext, AIOutputType } from "../types";
import { AI_CREDIT_COSTS, INCLUILAB_MODEL_COSTS, CREDIT_INSUFFICIENT_MSG } from "../config/aiCosts";
import { AiAuditService } from "./persistenceService";
import type { StudentContext } from "./studentContextService";
import { StudentContextService } from "./studentContextService";

// Ignora o aviso de tipos do TypeScript para o mammoth
// @ts-ignore
import * as mammoth from 'mammoth';

// ─── FUNÇÃO GLOBAL DE LIMPEZA DE JSON ─────────────────────────────────────────
export function cleanJsonString(raw: string): string {
  let s = raw.trim();
  s = s.replace(/\uFEFF/g, '');
  
  const start = s.indexOf('{');
  const startArr = s.indexOf('[');
  if (start !== -1 || startArr !== -1) {
    const firstBrace = start >= 0 ? start : Infinity;
    const firstBracket = startArr >= 0 ? startArr : Infinity;
    const startIndex = Math.min(firstBrace, firstBracket);
    
    const end = s.lastIndexOf('}');
    const endArr = s.lastIndexOf(']');
    const lastBrace = end >= 0 ? end : -Infinity;
    const lastBracket = endArr >= 0 ? endArr : -Infinity;
    const endIndex = Math.max(lastBrace, lastBracket);
    
    if (endIndex > startIndex) {
      s = s.substring(startIndex, endIndex + 1);
    } else {
      s = s.substring(startIndex);
    }
  }
  return s;
}

// --- CONFIGURAÇÃO DE IA (MULTI PROVIDER) ---
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
  /** ID do modelo selecionado (ex: 'texto_apenas', 'nano_banana_pro', 'chatgpt_imagem') */
  modelId?: string;
}

export interface ActivityImageOptions {
  bnccCodes?: string[];
  discipline?: string;
  grade?: string;
  period?: string;
}

// 1. PROVIDER: GOOGLE GEMINI (Atualizado para a biblioteca correta)
class GeminiProvider implements AIProvider {
  private client: GoogleGenerativeAI | null;
  private genAiClient: GoogleGenAI | null;
  private modelId = "gemini-2.5-flash";
  private imageModelId = "gemini-2.0-flash-preview-image-generation";

  constructor() {
    const apiKey = (import.meta as any).env?.VITE_GEMINI_API_KEY || (import.meta as any).env?.VITE_GOOGLE_API_KEY || (import.meta as any).env?.VITE_API_KEY || (process as any)?.env?.API_KEY;
    this.client = apiKey ? new GoogleGenerativeAI(apiKey) : null;
    this.genAiClient = apiKey ? new GoogleGenAI({ apiKey }) : null;
  }

  async generateText(prompt: string, imageBase64?: string): Promise<string> {
    if (!this.client) {
      throw new Error('CONFIG_GEMINI');
    }

    const parts: any[] = [{ text: prompt }];
    
    if (imageBase64) {
      const mimeMatch = imageBase64.match(/^data:([^;]+);base64,/);
      const mimeType = mimeMatch?.[1] || 'image/jpeg';
      const data = imageBase64.split(',')[1] || imageBase64;

      // Intercepta qualquer documento DOCX antes de chegar à IA
      if (mimeType.includes('wordprocessingml') || mimeType.includes('officedocument.wordprocessingml.document')) {
        console.info('[Gemini] Arquivo DOCX detectado no generateText. Extraindo texto com Mammoth...');
        try {
          const binaryString = atob(data);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          
          const result = await mammoth.extractRawText({ arrayBuffer: bytes.buffer });
          const docText = result.value.trim();

          if (!docText) throw new Error("Documento vazio.");

          parts[0].text += `\n\n[CONTEÚDO DO DOCUMENTO ANEXADO]:\n${docText}`;
        } catch (e) {
          console.error('[Gemini] Falha ao ler DOCX:', e);
          throw new Error("Não foi possível ler o documento Word. O arquivo pode estar corrompido.");
        }
      } else {
        parts.push({ inlineData: { mimeType, data } });
      }
    }

    try {
      const model = this.client.getGenerativeModel({ model: this.modelId });
      const response = await model.generateContent(parts);
      const text = response.response.text();
      return text;
    } catch (e: any) {
      const msg = e?.message || String(e);
      console.error('[Gemini] generateText ERRO:', msg, e);
      throw new Error(`Gemini (${this.modelId}): ${msg}`);
    }
  }

  async generateJSON(prompt: string): Promise<string> {
    if (!this.client) {
      throw new Error('CONFIG_GEMINI');
    }

    try {
      const model = this.client.getGenerativeModel({
        model: this.modelId,
        generationConfig: { responseMimeType: 'application/json' },
      });
      const response = await model.generateContent(prompt);
      return cleanJsonString(response.response.text());
    } catch (e: any) {
      console.warn('[Gemini] generateJSON com responseMimeType falhou, tentando sem:', e?.message);
      try {
        const fallbackModel = this.client.getGenerativeModel({ model: this.modelId });
        const response2 = await fallbackModel.generateContent(prompt + '\n\nResposta em JSON puro:');
        return cleanJsonString(response2.response.text());
      } catch (e2: any) {
        const msg = e2?.message || String(e2);
        console.error('[Gemini] generateJSON ERRO final:', msg);
        throw new Error(`Gemini JSON (${this.modelId}): ${msg}`);
      }
    }
  }

  async generateImage(prompt: string): Promise<string> {
    const errors: string[] = [];

    // ── Estágio 1 (PRIMÁRIO): Imagen 4.0 via Vertex AI ──────────────────────
    // Usa VITE_GOOGLE_PROJECT_ID + VITE_GOOGLE_LOCATION para billing no Cloud.
    // Requer Vertex AI habilitado no projeto Google Cloud configurado no .env.
    try {
      console.info('[GeminiProvider] Tentando Imagen 4.0 (Vertex AI)...');
      const { ImageGenerationService } = await import('./imageGenerationService');
      const result = await ImageGenerationService.generateWithFallback(prompt);
      console.info('[GeminiProvider] ✓ Imagen 4.0 OK');
      return result.base64DataUrl;
    } catch (imagenErr: any) {
      const msg = imagenErr?.message || String(imagenErr);
      errors.push(`Imagen 4.0: ${msg}`);
      console.warn('[GeminiProvider] Imagen 4.0 falhou:', msg);
    }

    // ── Estágio 2 (BACKUP): Gemini Flash image generation ───────────────────
    // Funciona com chave Gemini padrão, sem Vertex AI.
    if (this.genAiClient) {
      const safePrompt = [
        'Ilustração educativa infantil para impressão pedagógica (A4).',
        'Traço limpo, alto contraste, poucos elementos visuais, SEM texto na imagem.',
        'Estilo: livro didático inclusivo, cores suaves, fundo branco, amigável.',
        `Tema: ${prompt}`,
      ].join(' ');

      for (const modelId of [this.imageModelId, 'gemini-2.0-flash-exp']) {
        try {
          console.info(`[GeminiProvider] Backup: tentando ${modelId}...`);
          const response = await this.genAiClient.models.generateContent({
            model: modelId,
            contents: safePrompt,
            config: { responseModalities: [Modality.IMAGE, Modality.TEXT] },
          });
          const parts = response.candidates?.[0]?.content?.parts ?? [];
          for (const part of parts) {
            if (part.inlineData?.data && part.inlineData?.mimeType) {
              console.info(`[GeminiProvider] ✓ ${modelId} OK (backup)`);
              return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
            }
          }
          errors.push(`${modelId}: resposta sem dados de imagem`);
        } catch (e: any) {
          const msg = e?.message || String(e);
          errors.push(`${modelId}: ${msg}`);
          console.warn(`[GeminiProvider] ${modelId} falhou:`, msg);
        }
      }
    } else {
      errors.push('Gemini Flash: cliente não inicializado');
    }

    // Todos os estágios falharam — mensagem detalhada
    throw new Error(
      `Geração de imagem falhou em todos os modelos.\n` +
      errors.map((e, i) => `  ${i + 1}. ${e}`).join('\n') +
      `\n\nVerifique VITE_GEMINI_API_KEY, VITE_GOOGLE_PROJECT_ID e VITE_GOOGLE_LOCATION no .env.`
    );
  }
}

// 2. PROVIDER: OPENAI (CHATGPT)
class OpenAIProvider implements AIProvider {
    private apiKey: string | undefined;
    private modelId = "gpt-4o-mini";

    constructor() {
        this.apiKey = (import.meta as any).env?.VITE_OPENAI_API_KEY || process.env.REACT_APP_OPENAI_API_KEY;
    }

    async generateText(prompt: string, imageBase64?: string): Promise<string> {
        if (!this.apiKey) {
            throw new Error('CONFIG_OPENAI');
        }
        const messages: any[] = [{ role: 'user', content: [] }];
        messages[0].content.push({ type: 'text', text: prompt });
        if (imageBase64) {
            messages[0].content.push({ type: 'image_url', image_url: { url: imageBase64 } });
        }
        console.info(`[OpenAI] generateText — modelo: ${this.modelId}`);
        try {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
                body: JSON.stringify({ model: this.modelId, messages }),
            });
            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(`HTTP ${response.status}: ${(err as any)?.error?.message || response.statusText}`);
            }
            const data = await response.json();
            return data.choices?.[0]?.message?.content || '';
        } catch (e: any) {
            console.error('[OpenAI] generateText ERRO:', e?.message);
            throw new Error(`OpenAI (${this.modelId}): ${e?.message || e}`);
        }
    }

    async generateJSON(prompt: string): Promise<string> {
        if (!this.apiKey) {
            throw new Error('CONFIG_OPENAI');
        }
        console.info(`[OpenAI] generateJSON — modelo: ${this.modelId}`);
        try {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
                body: JSON.stringify({
                    model: this.modelId,
                    messages: [{ role: 'user', content: prompt }],
                    response_format: { type: 'json_object' },
                }),
            });
            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(`HTTP ${response.status}: ${(err as any)?.error?.message || response.statusText}`);
            }
            const data = await response.json();
            const raw = data.choices?.[0]?.message?.content || '{}';
            return cleanJsonString(raw);
        } catch (e: any) {
            console.error('[OpenAI] generateJSON ERRO:', e?.message);
            throw new Error(`OpenAI JSON (${this.modelId}): ${e?.message || e}`);
        }
    }

    async generateImage(prompt: string): Promise<string> {
        if (!this.apiKey) {
            throw new Error('CONFIG_IMAGE');
        }
        const { ImageService } = await import('./imageService');
        const result = await ImageService.generateActivityImage(prompt);
        return result.url;
    }
}

// 3. PROVIDER: FALLBACK (Gemini → OpenAI)
class FallbackProvider implements AIProvider {
    private gemini = new GeminiProvider();
    private openai = new OpenAIProvider();

    private get hasGemini(): boolean {
        return !!(this.gemini as any).client;
    }
    private get hasOpenAI(): boolean {
        return !!(this.openai as any).apiKey;
    }

    async generateText(prompt: string, imageBase64?: string): Promise<string> {
        if (this.hasGemini) {
            return this.gemini.generateText(prompt, imageBase64);
        }
        throw new Error('CONFIG_GEMINI');
    }

    async generateJSON(prompt: string): Promise<string> {
        if (this.hasGemini) {
            return this.gemini.generateJSON(prompt);
        }
        throw new Error('CONFIG_GEMINI');
    }

    async generateImage(prompt: string): Promise<string> {
        // Primário: Gemini (Gemini Flash → Imagen 4.0)
        if (this.hasGemini) {
            try {
                return await this.gemini.generateImage(prompt);
            } catch (geminiErr: any) {
                const geminiMsg = geminiErr?.message || String(geminiErr);
                console.warn('[FallbackProvider] Gemini imagem falhou:', geminiMsg);
                // Fallback final: OpenAI DALL-E 3 (requer VITE_OPENAI_API_KEY)
                if (this.hasOpenAI) {
                    try {
                        return await this.openai.generateImage(prompt);
                    } catch (openaiErr: any) {
                        const openaiMsg = openaiErr?.message || String(openaiErr);
                        throw new Error(
                            `Nenhuma imagem foi gerada.\n` +
                            `• Google (Gemini/Imagen): ${geminiMsg.split('\n')[0]}\n` +
                            `• OpenAI (DALL-E 3): ${openaiMsg}`
                        );
                    }
                }
                // Sem OpenAI — relança o erro do Gemini com contexto
                throw new Error(`Nenhuma imagem foi gerada. ${geminiMsg.split('\n')[0]}`);
            }
        }
        if (this.hasOpenAI) {
            return this.openai.generateImage(prompt);
        }
        throw new Error('CONFIG_IMAGE');
    }
}

const aiProvider: AIProvider = new FallbackProvider();

// ─── Motor de Texto (Gemini 1.5 Flash) — PDIs, PEIs, relatórios ─────────────
// ─── Motor de Imagem (IncluiLab)        — geração de ilustrações pedagógicas ─
export const CREDIT_COSTS: Record<string, number> = {
  ESTUDO_DE_CASO:    AI_CREDIT_COSTS.ESTUDO_DE_CASO,
  PEI:               AI_CREDIT_COSTS.PEI,
  PAEE:              AI_CREDIT_COSTS.PAEE,
  PDI:               AI_CREDIT_COSTS.PDI,
  ATIVIDADE:         AI_CREDIT_COSTS.ATIVIDADE_TEXTO,
  ATIVIDADE_IMAGEM:  AI_CREDIT_COSTS.ATIVIDADE_IMAGEM,
  INCLUILAB_IMAGE:   AI_CREDIT_COSTS.IMAGEM_PREMIUM,
  ANALISE_DOCUMENTO: AI_CREDIT_COSTS.ANALISE_DOCUMENTO,
  UPLOAD_MODELO:     AI_CREDIT_COSTS.UPLOAD_MODELO,
  OCR:               AI_CREDIT_COSTS.OCR,
  ADAPTAR_ATIVIDADE: AI_CREDIT_COSTS.ADAPTAR_ATIVIDADE,
  RELATORIO:         AI_CREDIT_COSTS.RELATORIO_PADRAO,
  EDULEISIA_ADAPTAR: AI_CREDIT_COSTS.EDULEISIA_ADAPTAR,
  EDULEISIA_IMAGEM:  AI_CREDIT_COSTS.EDULEISIA_IMAGEM,
  NEURODESIGN_REDESIGN: AI_CREDIT_COSTS.NEURODESIGN_REDESIGN,
  NEURODESIGN_IMAGEM:   AI_CREDIT_COSTS.NEURODESIGN_IMAGEM,
  TEMPLATE:          AI_CREDIT_COSTS.TEMPLATE,
};

// ─── REGISTRO DE MODELOS DE IA ────────────────────────────────────────────────
export const AI_MODEL_CONFIGS: AIModelConfig[] = [
  // ── Contexto: Relatórios ─────────────────────────────────────────────────────
  {
    id: 'economico',
    name: 'Econômico',
    provider: 'gemini',
    output_type: 'text',
    credit_cost: AI_CREDIT_COSTS.RELATORIO_ECONOMICO,
    active: true,
    allowed_contexts: ['reports'],
    description: 'Somente texto, custo mínimo',
  },
  {
    id: 'padrao',
    name: 'Padrão',
    provider: 'gemini',
    output_type: 'text',
    credit_cost: AI_CREDIT_COSTS.RELATORIO_PADRAO,
    active: true,
    allowed_contexts: ['reports', 'protocols'],
    description: 'Qualidade balanceada (recomendado)',
  },
  {
    id: 'premium',
    name: 'Premium',
    provider: 'fallback',
    output_type: 'text',
    credit_cost: AI_CREDIT_COSTS.RELATORIO_PREMIUM,
    active: true,
    allowed_contexts: ['reports'],
    description: 'Máxima qualidade e riqueza de detalhes',
    warning: `Consome ${AI_CREDIT_COSTS.RELATORIO_PREMIUM} créditos por geração`,
  },
  // ── Contexto: Atividades / IncluiLab ─────────────────────────────────────────
  {
    id: 'texto_apenas',
    name: 'Texto apenas',
    provider: 'gemini',
    output_type: 'text',
    credit_cost: INCLUILAB_MODEL_COSTS.TEXT,        // 3 créditos — regra oficial
    active: true,
    allowed_contexts: ['activities', 'incluilab'],
    description: 'Geração exclusiva de texto pedagógico',
  },
  {
    id: 'nano_banana_pro',
    name: 'Imagen 4.0',
    provider: 'gemini',
    output_type: 'text_image',
    credit_cost: INCLUILAB_MODEL_COSTS.GPT_IMAGE,
    active: true,
    allowed_contexts: ['activities', 'incluilab'],
    description: 'Texto + imagem pedagógica (Imagen 4.0 · Google)',
    warning: `Consome ${INCLUILAB_MODEL_COSTS.GPT_IMAGE} créditos por geração`,
  },
  {
    id: 'chatgpt_imagem',
    name: 'ChatGPT Imagem',
    provider: 'openai',
    output_type: 'text_image',
    credit_cost: INCLUILAB_MODEL_COSTS.GPT_IMAGE,
    active: false, // desativado — substituído pelo Imagen 4.0
    allowed_contexts: ['activities', 'incluilab'],
    description: 'Texto + imagem (desativado)',
  },
];

/** Retorna a configuração de um modelo pelo id. Cai em 'padrao' se não encontrar. */
export function getModelConfig(id: string): AIModelConfig {
  return AI_MODEL_CONFIGS.find(m => m.id === id) ?? AI_MODEL_CONFIGS.find(m => m.id === 'padrao')!;
}

/** Retorna modelos disponíveis para um contexto específico. */
export function getModelsForContext(context: AIModelContext): AIModelConfig[] {
  return AI_MODEL_CONFIGS.filter(m => m.active && m.allowed_contexts.includes(context));
}

/** Verifica se o modelo selecionado gera imagem (text_image). */
export function modelGeneratesImage(id: string): boolean {
  return getModelConfig(id).output_type === 'text_image';
}

/** Mensagem padronizada de saldo insuficiente */
function insufficientCreditsError(_required?: number, _balance?: number, _action?: string): Error {
  return new Error(CREDIT_INSUFFICIENT_MSG);
}

/**
 * Converte erros internos dos providers em mensagens amigáveis para o usuário.
 * Nunca expõe nomes de variáveis de ambiente ou detalhes de configuração.
 */
export function friendlyAIError(e: unknown): string {
  const raw = (e instanceof Error ? e.message : String(e)) || '';
  if (raw === 'CONFIG_GEMINI' || raw.includes('CONFIG_GEMINI')) {
    return 'O serviço de inteligência artificial não está configurado no ambiente. Entre em contato com o suporte.';
  }
  if (raw === 'CONFIG_OPENAI' || raw.includes('CONFIG_OPENAI')) {
    return 'O serviço de inteligência artificial não está configurado no ambiente. Entre em contato com o suporte.';
  }
  if (raw === 'CONFIG_IMAGE' || raw.includes('CONFIG_IMAGE')) {
    return 'Este modo de geração visual ainda não está configurado no ambiente.';
  }
  if (raw.includes('Failed to fetch') || raw.includes('NetworkError') || (e as any)?.name === 'TypeError') {
    return 'Falha de conexão com o serviço de IA. Verifique sua internet e tente novamente.';
  }
  if (raw.includes('quota') || raw.includes('429') || raw.includes('rate limit')) {
    return 'Limite de uso da IA atingido. Aguarde alguns instantes e tente novamente.';
  }
  // Mensagem genérica — sem expor detalhes técnicos internos
  return 'Ocorreu um erro ao processar sua solicitação. Tente novamente ou contate o suporte.';
}


export const AIService = {

  async getRemainingCredits(user: User): Promise<number> {
    if (!user || !user.tenant_id) return -1;
    try {
      const { data, error } = await supabase
        .from('credits_wallet')
        .select('balance')
        .eq('tenant_id', user.tenant_id)
        .maybeSingle();
      if (error) return -1;
      const val = Number((data as any)?.balance ?? -1);
      return Number.isFinite(val) ? val : -1;
    } catch {
      return -1;
    }
  },

  async checkCredits(user: User, cost: number = 1): Promise<boolean> {
      if (!user || !(user as any).tenant_id) return true;
      try {
        const { data, error } = await supabase
          .from('credits_wallet')
          .select('balance')
          .eq('tenant_id', (user as any).tenant_id)
          .maybeSingle();
        if (error) {
          console.warn('[AIService] credit check error:', error.message);
          return true;
        }
        if (!data) return true;
        const remaining = Number((data as any)?.balance ?? 0);
        if (Number.isNaN(remaining)) return true;
        return remaining >= cost;
      } catch (e) {
        console.warn('[AIService] credit check skipped due to schema/config error', e);
        return true;
      }
  },

  /** Retorna o saldo atual (0 se não encontrado ou erro). */
  async getCreditsBalance(user: User): Promise<number> {
      if (!user || !(user as any).tenant_id) return 0;
      try {
        const { data } = await supabase
          .from('credits_wallet')
          .select('balance')
          .eq('tenant_id', (user as any).tenant_id)
          .maybeSingle();
        return Number((data as any)?.balance ?? 0);
      } catch {
        return 0;
      }
  },

  async deductCredits(user: User, action: string, cost: number) {
      if (!user || !(user as any).tenant_id) return;
      try {
        const tenantId  = (user as any).tenant_id;
        const userId    = (user as any).id ?? null;

        // 1. Atualiza credits_wallet
        const { data: wallet, error: readErr } = await supabase
          .from('credits_wallet')
          .select('id, balance')
          .eq('tenant_id', tenantId)
          .maybeSingle();

        if (readErr) console.warn('[AIService] deductCredits read error:', readErr.message);

        if (wallet) {
          const current = Number((wallet as any).balance ?? 0);
          const next    = Math.max(0, current - cost);
          const { error: updateErr } = await supabase
            .from('credits_wallet')
            .update({ balance: next, updated_at: new Date().toISOString() })
            .eq('id', (wallet as any).id);
          if (updateErr) console.warn('[AIService] deductCredits wallet update error:', updateErr.message);
        } else {
          console.warn('[AIService] credits_wallet nao encontrado para tenant', tenantId);
        }

        // 2. Registra no ledger com todos os campos obrigatorios
        const { error: ledgerErr } = await supabase.from('credits_ledger').insert({
          tenant_id:   tenantId,
          user_id:     userId,
          type:        'usage_ai',
          amount:      -cost,
          description: 'IA: ' + action,
        });
        if (ledgerErr) console.warn('[AIService] credits_ledger insert error:', ledgerErr.message);

      } catch (e) {
        console.warn('[AIService] deductCredits unexpected error:', e);
      }
  },
  async generateProtocol(type: any, student: Student, user: User, laudo?: string): Promise<string> {
      const cost = CREDIT_COSTS[type] || 1;
      if (!(await this.checkCredits(user, cost))) {
        const balance = await this.getCreditsBalance(user);
        throw insufficientCreditsError(cost, balance, `gerar ${String(type)}`);
      }

      const prompt = `Gere o protocolo ${type} para ${student.name}. Diagnóstico: ${student.diagnosis.join(', ')}. Nível de suporte: ${student.supportLevel}.`;
      const textResult = await aiProvider.generateText(prompt, laudo);

      await this.deductCredits(user, type, cost);
      return textResult;
  },

  async generateProtocolJSON(type: any, student: Student, user: User, studentContext?: StudentContext): Promise<string> {
      const cost = CREDIT_COSTS[type] || 1;
      if (!(await this.checkCredits(user, cost))) {
        const balance = await this.getCreditsBalance(user);
        throw insufficientCreditsError(cost, balance, `gerar documento ${String(type)}`);
      }

      const auditId = await AiAuditService.logRequest({
        tenantId: (user as any).tenant_id ?? '',
        userId: user.id,
        requestType: `protocol_${String(type).toLowerCase()}`,
        model: 'gemini-2.5-flash',
        creditsConsumed: cost,
        inputData: { studentId: student.id, studentName: student.name, docType: type },
      });
      const t0 = Date.now();

      const docLabel = String(type);
      const diagnosis = (student.diagnosis || []).join(', ') || 'Não informado';
      const cid = Array.isArray(student.cid) ? student.cid.join(', ') : (student.cid || 'Não informado');
      const abilities = (student.abilities || []).join('; ') || 'Não informado';
      const difficulties = (student.difficulties || []).join('; ') || 'Não informado';
      const strategies = (student.strategies || []).join('; ') || 'Não informado';

      // Monta contexto consolidado do banco (se não foi fornecido externamente, tenta carregar)
      let ctxBlock = '';
      if (studentContext && StudentContextService.hasData(studentContext)) {
        ctxBlock = StudentContextService.toPromptText(studentContext);
      } else if (student.id) {
        try {
          const autoCtx = await StudentContextService.buildContext(student.id);
          if (StudentContextService.hasData(autoCtx)) ctxBlock = StudentContextService.toPromptText(autoCtx);
        } catch { /* contexto é opcional — falha silenciosa */ }
      }

      const prompt = `Você é especialista em educação inclusiva e documentação pedagógica brasileira.
Gere um documento completo do tipo "${docLabel}" para o aluno abaixo.

Dados cadastrais do aluno:
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

IMPORTANTE: "Nome do aluno" refere-se APENAS ao estudante. "Responsável legal" é o adulto guardião. "Professor Regente" e "Professor AEE" são educadores. Nunca confunda ou misture essas identidades no documento gerado.

${ctxBlock}

RETORNE SOMENTE o JSON válido abaixo, sem texto adicional, sem markdown, sem comentários:
{
  "sections": [
    {
      "id": "sec1",
      "title": "Nome da Seção",
      "fields": [
        {
          "id": "f1",
          "label": "Nome do Campo",
          "type": "textarea",
          "value": "Conteúdo gerado aqui, detalhado e específico para o aluno..."
        }
      ]
    }
  ]
}

Regras obrigatórias:
- Use type "textarea" para textos longos descritivos (narrativas, objetivos, pareceres)
- Use type "text" para informações curtas (datas, nomes, códigos)
- Preencha "value" com conteúdo REAL, específico para ${student.name}, baseado nos dados fornecidos
- Mínimo 4 seções, máximo 8. Cada seção: 2 a 5 campos
- Idioma: português brasileiro formal, linguagem pedagógica profissional
- O conteúdo deve ser completo, útil e pronto para uso educacional
- Baseie-se nas melhores práticas de educação inclusiva brasileira e na LDBEN/Lei Brasileira de Inclusão`;

      let jsonResult: string;
      try {
        jsonResult = await aiProvider.generateJSON(prompt);
      } catch (e: any) {
        const msg = e?.message || String(e);
        console.error('[AIService.generateProtocolJSON] Falha na geração:', msg);
        if (auditId) AiAuditService.completeRequest(auditId, { status: 'failed', latencyMs: Date.now() - t0 });
        throw new Error(msg);
      }

      try {
        JSON.parse(jsonResult);
      } catch (parseErr) {
        console.warn('[AIService.generateProtocolJSON] Resposta não é JSON válido após limpeza:', jsonResult.slice(0, 300));
        const fallback = {
          sections: [
            {
              id: 'sec1',
              title: 'Identificação do Aluno',
              fields: [
                { id: 'f1', label: 'Nome', type: 'text', value: student.name },
                { id: 'f2', label: 'Diagnóstico', type: 'text', value: (student.diagnosis || []).join(', ') || '—' },
                { id: 'f3', label: 'Nível de Suporte', type: 'text', value: student.supportLevel || 'Nível 1' },
              ],
            },
            {
              id: 'sec2',
              title: 'Objetivo do Documento',
              fields: [
                { id: 'f4', label: 'Objetivo Geral', type: 'textarea', value: `Documento ${docLabel} para acompanhamento pedagógico de ${student.name}. Preencha os campos conforme as necessidades observadas.` },
              ],
            },
          ],
        };
        await this.deductCredits(user, type, Math.floor(cost / 2));
        if (auditId) AiAuditService.completeRequest(auditId, { status: 'failed', latencyMs: Date.now() - t0, outputType: 'json', content: 'parse_error_fallback' });
        return JSON.stringify(fallback);
      }

      await this.deductCredits(user, type, cost);
      if (auditId) AiAuditService.completeRequest(auditId, { status: 'success', latencyMs: Date.now() - t0, outputType: 'json', content: jsonResult.slice(0, 500) });
      return jsonResult;
  },

  async analyzeDocument(name: string, _urlOrBase64: string | undefined, student: Student, user: User): Promise<any> {
      const cost = CREDIT_COSTS.ANALISE_DOCUMENTO;
      if (!(await this.checkCredits(user, cost))) {
        const balance = await this.getCreditsBalance(user);
        throw insufficientCreditsError(cost, balance, 'analisar este laudo');
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
  "synthesis": "Síntese detalhada do que o documento provavelmente contém e suas implicações para a educação inclusiva do aluno",
  "pedagogicalPoints": ["ponto pedagógico 1", "ponto pedagógico 2", "ponto pedagógico 3"],
  "suggestions": ["sugestão de intervenção 1", "sugestão de intervenção 2", "sugestão de intervenção 3"],
  "auditCode": "DOC-${Date.now()}"
}`;

      await this.deductCredits(user, 'ANALISE_DOCUMENTO', cost);
      try {
          const analysisText = await aiProvider.generateJSON(prompt);
          const parsed = JSON.parse(analysisText);
          return parsed;
      } catch {
          return {
              id: `ANALISE-${Date.now()}`,
              documentName: name,
              date: new Date().toLocaleDateString('pt-BR'),
              synthesis: `Documento "${name}" recebido. Análise baseada nos dados do aluno ${student.name} (${diagnosis}).`,
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

  async generateActivity(topic: string, student: Student, user: User, options?: ActivityGenOptions | string): Promise<string> {
      const normalized: ActivityGenOptions = (() => {
        if (!options) return {};
        if (typeof options === 'string') return { imageBase64: options };
        return options;
      })();
      const modelCfg = getModelConfig(normalized.modelId ?? 'texto_apenas');
      const cost = modelCfg.credit_cost;
      if (!(await this.checkCredits(user, cost))) {
        const balance = await this.getCreditsBalance(user);
        throw insufficientCreditsError(cost, balance, `gerar atividade (${modelCfg.name})`);
      }

      const auditId = await AiAuditService.logRequest({
        tenantId: (user as any).tenant_id ?? '',
        userId: user.id,
        requestType: 'activity',
        model: modelCfg.id,
        creditsConsumed: cost,
        inputData: { studentId: student.id, topic, modelId: modelCfg.id },
      });
      const t0 = Date.now();

      const bncc = (normalized.bnccCodes || []).filter(Boolean);
      const discipline = normalized.discipline?.trim();
      const grade = normalized.grade?.trim();
      const period = normalized.period?.trim();

      const asTeacher = normalized.teacherActivity !== false; 

      const formatTeacher = asTeacher ? `
Inclua também:
- **Contexto** (turma/ano/série, disciplina e período)
- **Passo a passo do professor** (com tempo estimado)
- **Extensões** (desafios, variações, casa)
` : '';

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
${asTeacher ? formatTeacher : ''}
Formato OBRIGATÓRIO (use Markdown):
# [Título curto da atividade]

## Objetivo (1–2 linhas)
- ...

## Materiais (lista curta)
- ...

## Instruções para o aluno (passo a passo, 5–8 linhas)
1. ...
2. ...

## Adaptações / Acessibilidade (3–6 bullets)
- ...

## Avaliação rápida (rubrica simples 0–2)
- 0: ...
- 1: ...
- 2: ...

## Observações (opcional, 2–4 linhas)
- ...

Regras:
- Não escreva textos longos nem "aula inteira" para o professor.
- Linguagem direta, adequada ao aluno e à família.
- Se BNCC estiver vazio, sugira **1–2** códigos plausíveis e marque como "Sugestão".`;

      let textResult: string;
      try {
        textResult = await aiProvider.generateText(prompt, normalized.imageBase64);
      } catch (e: any) {
        if (auditId) AiAuditService.completeRequest(auditId, { status: 'failed', latencyMs: Date.now() - t0 });
        throw e;
      }
      await this.deductCredits(user, `ATIVIDADE:${modelCfg.id}`, cost);
      if (auditId) AiAuditService.completeRequest(auditId, { status: 'success', latencyMs: Date.now() - t0, outputType: modelCfg.output_type, content: textResult.slice(0, 500) });
      return textResult;
  },

  async generateActivityImage(description: string, student: Student, user: User, options?: ActivityImageOptions): Promise<{imageUrl: string, guidance: string}> {
      const cost = CREDIT_COSTS.ATIVIDADE_IMAGEM; // Motor de Imagem IncluiLab: 50 créditos
      if (!(await this.checkCredits(user, cost))) {
        const balance = await this.getCreditsBalance(user);
        throw insufficientCreditsError(cost, balance, 'gerar esta imagem');
      }

      const bncc = (options?.bnccCodes || []).filter(Boolean);
      const discipline = options?.discipline?.trim();
      const grade = options?.grade?.trim();
      const period = options?.period?.trim();

      const guidancePrompt = `Você é professora AEE/inclusão. Crie orientações de aplicação para uma atividade visual sobre "${description}".
Estudante:
- Nome: ${student.name}
- Diagnóstico(s): ${student.diagnosis.join(', ')}
- Nível de suporte: ${student.supportLevel}

Contexto:
- Disciplina: ${discipline || 'não informado'}
- Ano/Série: ${grade || 'não informado'}
- Período/Unidade: ${period || 'não informado'}
- BNCC: ${bncc.length ? bncc.join(', ') : 'não informado'}

Entregue em Markdown com:
1) **Objetivos pedagógicos**
2) **Como aplicar (passo a passo + tempo)**
3) **Adaptações (3 níveis)**
4) **Checklist de evidências para avaliação**`;
      const guidance = await aiProvider.generateText(guidancePrompt);

      const imagePrompt = `Ilustração educativa infantil para impressão (A4), traço limpo, alto contraste, poucos elementos, sem texto.
Tema: ${description}
Estilo: material pedagógico, amigável, inclusivo, cores suaves, fundo branco, foco no conteúdo principal.`;
      const imageUrl = await aiProvider.generateImage(imagePrompt);

      await this.deductCredits(user, 'ATIVIDADE_IMAGEM', cost);
      return { imageUrl, guidance };
  },

  async analyzeUploadedDocument(fileBase64: string, _mimeType: string, docType: DocumentType, student: Student, user: User): Promise<DocumentAnalysis> {
      const cost = CREDIT_COSTS.ANALISE_DOCUMENTO;
      if (!(await this.checkCredits(user, cost))) {
        const balance = await this.getCreditsBalance(user);
        throw insufficientCreditsError(cost, balance, 'analisar este documento');
      }

      const prompt = `Analise o documento enviado (tipo ${docType}) e extraia dados úteis para educação inclusiva do aluno ${student.name}.
Retorne JSON com: resumo, achados, recomendações, sinais de alerta, e sugestões de adaptações.`;

      const analysisText = await aiProvider.generateText(prompt, fileBase64);
      await this.deductCredits(user, 'ANALISE_DOCUMENTO', cost);

      try {
          const parsed = JSON.parse(analysisText);
          return parsed;
      } catch {
          return { summary: analysisText } as any;
      }
  },

  async generateFromPrompt(prompt: string, _user: User): Promise<string> {
      return aiProvider.generateJSON(prompt);
  },

  async generateFromPromptWithImage(prompt: string, imageBase64: string, _user: User): Promise<string> {
      return aiProvider.generateText(prompt, imageBase64);
  },

  async generateImageFromPrompt(prompt: string, user: User, costOverride?: number, skipDeduction = false): Promise<string> {
      // costOverride permite que o chamador injete o custo real do modelo (ex.: 30 para Nano Banana Pro)
      // skipDeduction=true permite que o chamador faça deducção em lote (evita double-billing em loops)
      const cost = costOverride ?? CREDIT_COSTS.INCLUILAB_IMAGE;
      if (!skipDeduction) {
        if (!(await this.checkCredits(user, cost))) {
          const balance = await this.getCreditsBalance(user);
          throw insufficientCreditsError(cost, balance, 'gerar esta imagem');
        }
      }
      const result = await aiProvider.generateImage(prompt);
      if (result && !skipDeduction) await this.deductCredits(user, 'INCLUILAB_IMAGE', cost);
      return result;
  },

  async generateTextFromPrompt(prompt: string, _user: User): Promise<string> {
      return aiProvider.generateText(prompt);
  },

  async extractTextFromImage(base64: string, user: User): Promise<string> {
      const cost = CREDIT_COSTS.OCR || 1;
      if (!(await this.checkCredits(user, cost))) throw insufficientCreditsError(cost, undefined, 'OCR');
      const prompt = `Extraia e transcreva TODO o texto visível nesta imagem, exatamente como aparece.
Se for uma atividade ou exercício escolar, preserve a estrutura (enunciado, questões, lacunas, etc.).
Retorne somente o texto extraído, sem comentários adicionais.`;
      const result = await aiProvider.generateText(prompt, base64);
      await this.deductCredits(user, 'OCR', cost);
      return result;
  },

  async generateReport(context: string, instruction: string, user: User, modelId?: string): Promise<string> {
      const modelCfg = getModelConfig(modelId ?? 'padrao');
      // Valida contexto: apenas modelos de relatórios são aceitos aqui
      if (!modelCfg.allowed_contexts.includes('reports')) {
        throw new Error(`Modelo "${modelCfg.name}" não é compatível com geração de relatórios.`);
      }
      const cost = modelCfg.credit_cost;
      if (!(await this.checkCredits(user, cost))) {
        const balance = await this.getCreditsBalance(user);
        throw insufficientCreditsError(cost, balance, `gerar relatório (${modelCfg.name})`);
      }

      const fullPrompt = context?.trim()
          ? `${instruction}\n\nCONTEXTO DO DOCUMENTO:\n${context}`
          : instruction;

      const result = await aiProvider.generateText(fullPrompt);
      await this.deductCredits(user, `RELATORIO:${modelCfg.id}`, cost);
      return result;
  },

  async adaptActivityText(text: string, diagnosis: string, grade: string, user: User): Promise<string> {
      const cost = CREDIT_COSTS.ADAPTAR_ATIVIDADE;
      if (!(await this.checkCredits(user, cost))) throw insufficientCreditsError(cost, undefined, 'adaptar atividade');

      const diagnosisLabels: Record<string, string> = {
          autismo: 'Transtorno do Espectro Autista (TEA)',
          tdah: 'TDAH',
          dislexia: 'Dislexia',
          di: 'Deficiência Intelectual',
          geral: 'simplificação geral para inclusão',
      };
      const diagLabel = diagnosisLabels[diagnosis] || diagnosis;
      const gradeLabel = grade || 'Ensino Fundamental';

      const prompt = `Você é especialista em educação inclusiva e AEE.
Adapte a atividade abaixo para um aluno com ${diagLabel}, série: ${gradeLabel}.

ATIVIDADE ORIGINAL:
${text}

REGRAS DE ADAPTAÇÃO:
- Linguagem simples e direta, frases curtas
- Instruções em etapas numeradas e claras
- Remova ambiguidades
- Se TEA: adicione suporte visual (descreva imagens sugeridas entre colchetes [imagem: ...])
- Se TDAH: divida em tarefas menores, adicione checkboxes
- Se Dislexia: use fonte maior sugerida, espaçamento, evite blocos de texto
- Se DI: simplifique vocabulário, adicione exemplos concretos
- Mantenha os objetivos pedagógicos originais
- Use português brasileiro

Retorne SOMENTE a atividade adaptada, pronta para uso.`;

      const result = await aiProvider.generateText(prompt);
      await this.deductCredits(user, 'ADAPTAR_ATIVIDADE', cost);
      return result;
  },

  async saveGeneratedActivity(params: {
    user: User;
    title: string;
    templateType: string;
    content: string;
    imageCount: number;
    creditsUsed: number;
    studentId?: string;
    /** ID do modelo de IA utilizado (ex: 'texto_apenas', 'nano_banana_pro') */
    modelUsed?: string;
    /** Tipo de saída: 'text' ou 'text_image' */
    outputType?: AIOutputType;
    /** URLs reais das imagens geradas (persistidas no Storage) */
    imageUrls?: string[];
  }): Promise<{ id: string }> {
    const { user, title, templateType, content, imageCount, creditsUsed, studentId, modelUsed, outputType, imageUrls } = params;

    // Salva a primeira URL real em image_url; demais em guidance como JSON
    const firstUrl = imageUrls?.find(u => !!u) ?? null;
    const guidanceData = imageUrls && imageUrls.length > 0
      ? JSON.stringify({ imageUrls, count: imageUrls.length })
      : (imageCount > 0 ? JSON.stringify({ count: imageCount }) : null);

    const { data, error } = await supabase
      .from('generated_activities')
      .insert({
        tenant_id:    user.tenant_id,
        user_id:      user.id,
        student_id:   studentId || null,
        title,
        content:      content.slice(0, 10000),
        tags:         templateType ? [templateType] : [],
        is_adapted:   true,
        credits_used: creditsUsed,
        image_url:    firstUrl,
        guidance:     guidanceData,
        model_used:   modelUsed ?? null,
        output_type:  outputType ?? 'text',
      })
      .select('id')
      .single();

    if (error) {
      const isRls = error.code === '42501' || (error.message ?? '').includes('row-level security');
      const isUnauth = error.code === 'PGRST301' || (error.message ?? '').includes('JWT');
      if (isUnauth) throw new Error('Sessão expirada. Faça login novamente para salvar a atividade.');
      if (isRls)    throw new Error('Sem permissão para salvar. Verifique se sua sessão está ativa e tente novamente.');
      throw new Error('Não foi possível salvar a atividade. Tente novamente.');
    }

    if (studentId && data?.id) {
      try {
        await supabase.from('student_timeline').insert({
          tenant_id:   user.tenant_id,
          student_id:  studentId,
          event_type:  'atividade',
          title:       `Atividade gerada: ${title}`,
          description: `Template: ${templateType} · Modelo: ${modelUsed ?? 'padrão'} · ${imageCount > 0 ? `${imageCount} imagens` : 'Texto'} · ${creditsUsed} créditos`,
          linked_id:   data.id,
          linked_table: 'generated_activities',
          icon:        'Zap',
          author:      user.name,
          event_date:  new Date().toISOString().split('T')[0],
        });
      } catch {} 
    }

    return { id: data.id };
  },
};