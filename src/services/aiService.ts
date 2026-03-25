// aiService.ts
import { GoogleGenerativeAI } from "@google/generative-ai";
import { supabase } from "./supabase";
import { User, DocumentType, Student, DocumentAnalysis } from "../types";
import { AiAuditService } from "./persistenceService";

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
  private modelId = "gemini-2.5-flash"; 

  constructor() {
    const apiKey = (import.meta as any).env?.VITE_GEMINI_API_KEY || (import.meta as any).env?.VITE_GOOGLE_API_KEY || (import.meta as any).env?.VITE_API_KEY || (process as any)?.env?.API_KEY;
    this.client = apiKey ? new GoogleGenerativeAI(apiKey) : null;
  }

  async generateText(prompt: string, imageBase64?: string): Promise<string> {
    if (!this.client) {
      throw new Error(
        'Chave de API do Gemini não encontrada. Verifique VITE_GEMINI_API_KEY no arquivo .env e reinicie o servidor.'
      );
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
      throw new Error(
        'Chave de API do Gemini não encontrada. Verifique VITE_GEMINI_API_KEY no arquivo .env e reinicie o servidor.'
      );
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
      return ""; // O Gemini via GenerativeAI requer configurações adicionais para imagens. Mantemos o fallback vazio por segurança.
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
            throw new Error('Chave de API da OpenAI não encontrada. Verifique VITE_OPENAI_API_KEY no .env.');
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
            throw new Error('Chave de API da OpenAI não encontrada. Verifique VITE_OPENAI_API_KEY no .env.');
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

    async generateImage(_prompt: string): Promise<string> {
        return "";
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
        throw new Error('Chave de API do Gemini não encontrada.');
    }

    async generateJSON(prompt: string): Promise<string> {
        if (this.hasGemini) {
            return this.gemini.generateJSON(prompt);
        }
        throw new Error('Chave de API do Gemini não encontrada.');
    }

    async generateImage(prompt: string): Promise<string> {
        if (this.hasGemini) {
            try { return await this.gemini.generateImage(prompt); } catch {}
        }
        return this.openai.generateImage(prompt);
    }
}

const aiProvider: AIProvider = new FallbackProvider();

export const CREDIT_COSTS: Record<string, number> = {
  // Documentos pedagogicos
  ESTUDO_DE_CASO:    2,
  PEI:               3,   // PEI e mais complexo — 3 creditos
  PAEE:              2,
  PDI:               2,
  // Atividades
  ATIVIDADE:         1,
  ATIVIDADE_IMAGEM:  2,
  // Analise e adaptacao
  ANALISE_DOCUMENTO: 2,
  OCR:               1,
  ADAPTAR_ATIVIDADE: 2,
  RELATORIO:         2,
  // Modelo personalizado
  TEMPLATE:          3,
};

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
      if (!(await this.checkCredits(user, cost))) throw new Error(`Saldo insuficiente.`);

      const prompt = `Gere o protocolo ${type} para ${student.name}. Diagnóstico: ${student.diagnosis.join(', ')}. Nível de suporte: ${student.supportLevel}.`;
      const textResult = await aiProvider.generateText(prompt, laudo);

      await this.deductCredits(user, type, cost);
      return textResult;
  },

  async generateProtocolJSON(type: any, student: Student, user: User): Promise<string> {
      const cost = CREDIT_COSTS[type] || 1;
      if (!(await this.checkCredits(user, cost))) throw new Error(`Saldo insuficiente.`);

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

      const prompt = `Você é especialista em educação inclusiva e documentação pedagógica brasileira.
Gere um documento completo do tipo "${docLabel}" para o aluno abaixo.

Dados do aluno:
- Nome: ${student.name}
- Diagnóstico(s): ${diagnosis}
- CID: ${cid}
- Nível de Suporte: ${student.supportLevel || 'Não informado'}
- Habilidades: ${abilities}
- Dificuldades: ${difficulties}
- Estratégias eficazes: ${strategies}
- Série/Turno: ${student.grade || '—'} / ${student.shift || '—'}
- Professor Regente: ${student.regentTeacher || '—'}
- Professor AEE: ${student.aeeTeacher || '—'}
- Contexto familiar: ${student.familyContext || 'Não informado'}
- Histórico escolar: ${student.schoolHistory || 'Não informado'}

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
      const cost = CREDIT_COSTS.ANALISE_DOCUMENTO || 2;
      if (!(await this.checkCredits(user, cost))) throw new Error("Saldo insuficiente para análise.");

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
      const cost = 1;
      if (!(await this.checkCredits(user, cost))) throw new Error(`Saldo insuficiente.`);

      const auditId = await AiAuditService.logRequest({
        tenantId: (user as any).tenant_id ?? '',
        userId: user.id,
        requestType: 'activity',
        model: 'gemini-2.5-flash',
        creditsConsumed: cost,
        inputData: { studentId: student.id, topic },
      });
      const t0 = Date.now();

      const normalized: ActivityGenOptions = (() => {
        if (!options) return {};
        if (typeof options === 'string') return { imageBase64: options };
        return options;
      })();

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
      await this.deductCredits(user, 'ATIVIDADE', cost);
      if (auditId) AiAuditService.completeRequest(auditId, { status: 'success', latencyMs: Date.now() - t0, outputType: 'text', content: textResult.slice(0, 500) });
      return textResult;
  },

  async generateActivityImage(description: string, student: Student, user: User, options?: ActivityImageOptions): Promise<{imageUrl: string, guidance: string}> {
      const cost = 2; 
      if (!(await this.checkCredits(user, cost))) throw new Error("Saldo insuficiente para imagem.");

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

  async analyzeUploadedDocument(fileBase64: string, mimeType: string, docType: DocumentType, student: Student, user: User): Promise<DocumentAnalysis> {
      const cost = CREDIT_COSTS.ANALISE_DOCUMENTO || 2;
      if (!(await this.checkCredits(user, cost))) throw new Error("Saldo insuficiente.");

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

  async generateImageFromPrompt(prompt: string, user: User): Promise<string> {
      const cost = CREDIT_COSTS.ATIVIDADE_IMAGEM || 2;
      if (!(await this.checkCredits(user, cost))) throw new Error('Saldo de créditos insuficiente.');
      const result = await aiProvider.generateImage(prompt);
      if (result) await this.deductCredits(user, 'ATIVIDADE_IMAGEM', cost);
      return result;
  },

  async generateTextFromPrompt(prompt: string, _user: User): Promise<string> {
      return aiProvider.generateText(prompt);
  },

  async extractTextFromImage(base64: string, user: User): Promise<string> {
      const cost = CREDIT_COSTS.OCR || 1;
      if (!(await this.checkCredits(user, cost))) throw new Error('Saldo insuficiente para OCR.');
      const prompt = `Extraia e transcreva TODO o texto visível nesta imagem, exatamente como aparece.
Se for uma atividade ou exercício escolar, preserve a estrutura (enunciado, questões, lacunas, etc.).
Retorne somente o texto extraído, sem comentários adicionais.`;
      const result = await aiProvider.generateText(prompt, base64);
      await this.deductCredits(user, 'OCR', cost);
      return result;
  },

  async generateReport(context: string, instruction: string, user: User): Promise<string> {
      const cost = CREDIT_COSTS.RELATORIO || 2;
      if (!(await this.checkCredits(user, cost))) throw new Error('Saldo insuficiente para gerar relatório.');

      const fullPrompt = context?.trim()
          ? `${instruction}\n\nCONTEXTO DO DOCUMENTO:\n${context}`
          : instruction;

      const result = await aiProvider.generateText(fullPrompt);
      await this.deductCredits(user, 'RELATORIO', cost);
      return result;
  },

  async adaptActivityText(text: string, diagnosis: string, grade: string, user: User): Promise<string> {
      const cost = CREDIT_COSTS.ADAPTAR_ATIVIDADE || 2;
      if (!(await this.checkCredits(user, cost))) throw new Error('Saldo insuficiente para adaptar atividade.');

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
  }): Promise<{ id: string }> {
    const { user, title, templateType, content, imageCount, creditsUsed, studentId } = params;

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
        guidance:     imageCount > 0 ? `${imageCount} imagens geradas` : null,
      })
      .select('id')
      .single();

    if (error) throw new Error('Erro ao salvar atividade: ' + error.message);

    if (studentId && data?.id) {
      try {
        await supabase.from('student_timeline').insert({
          tenant_id:   user.tenant_id,
          student_id:  studentId,
          event_type:  'atividade',
          title:       `Atividade gerada: ${title}`,
          description: `Template: ${templateType} · ${imageCount > 0 ? `${imageCount} imagens` : 'Texto'} · ${creditsUsed} créditos`,
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