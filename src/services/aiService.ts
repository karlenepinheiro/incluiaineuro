// aiService.ts
import { GoogleGenAI } from "@google/genai";
import { supabase } from "./supabase";
import { User, DocumentType, Student, DocumentAnalysis } from "../types";

// --- CONFIGURAÇÃO DE IA (MULTI PROVIDER) ---
export interface AIProvider {
  generateText(prompt: string, imageBase64?: string): Promise<string>;
  generateJSON(prompt: string): Promise<string>;
  generateImage(prompt: string): Promise<string>; // New method
}

export interface ActivityGenOptions {
  bnccCodes?: string[];
  discipline?: string;
  grade?: string;
  period?: string;
  teacherActivity?: boolean;
  imageBase64?: string; // optional image context (upload) to help generation
}

export interface ActivityImageOptions {
  bnccCodes?: string[];
  discipline?: string;
  grade?: string;
  period?: string;
}

// 1. PROVIDER: GOOGLE GEMINI
class GeminiProvider implements AIProvider {
  private client: GoogleGenAI | null;
  private modelId = "gemini-1.5-flash"; // modelo estável e disponível via API
  private imageModelId = "gemini-1.5-flash"; // fallback seguro

  constructor() {
    const apiKey = (import.meta as any).env?.VITE_GEMINI_API_KEY || (import.meta as any).env?.VITE_GOOGLE_API_KEY || (import.meta as any).env?.VITE_API_KEY || (process as any)?.env?.API_KEY;
    this.client = apiKey ? new GoogleGenAI({ apiKey }) : null;
  }

  async generateText(prompt: string, imageBase64?: string): Promise<string> {
    if (!this.client) return "ERRO: Chave API do Google Gemini não configurada.";
    
    const parts: any[] = [{ text: prompt }];
    if (imageBase64) {
      parts.push({
        inlineData: {
            mimeType: "image/jpeg",
            data: imageBase64.split(',')[1] || imageBase64
        }
      });
    }

    try {
        const response = await this.client.models.generateContent({
            model: this.modelId,
            contents: { parts }
        });
        return response.text || "";
    } catch (e) {
        console.error("Gemini Error", e);
        throw new Error("Falha na geração com Gemini");
    }
  }

  async generateJSON(prompt: string): Promise<string> {
      if (!this.client) return "{}";
      const parts = [{ text: prompt }];
      try {
        const response = await this.client.models.generateContent({
            model: this.modelId,
            contents: { parts },
            config: { responseMimeType: "application/json" }
        });
        return response.text || "{}";
    } catch (e) {
        console.error("Gemini JSON Error", e);
        throw new Error("Falha na geração JSON com Gemini");
    }
  }

  async generateImage(prompt: string): Promise<string> {
      if (!this.client) return "";
      try {
          // Try Imagen 3 for text-to-image generation
          const response = await (this.client.models as any).generateImages({
              model: 'imagen-3.0-generate-001',
              prompt,
              config: { numberOfImages: 1, aspectRatio: '1:1' },
          });
          const img = response?.generatedImages?.[0]?.image?.imageBytes;
          if (img) return `data:image/png;base64,${img}`;

          // Fallback: gemini multimodal with image output request
          const r2 = await this.client.models.generateContent({
              model: 'gemini-2.0-flash-exp',
              contents: { parts: [{ text: `Generate an educational illustration: ${prompt}` }] },
              config: { responseModalities: ['IMAGE', 'TEXT'] } as any,
          });
          if (r2.candidates?.[0]?.content?.parts) {
              for (const part of r2.candidates[0].content.parts) {
                  if ((part as any).inlineData) {
                      const d = (part as any).inlineData;
                      return `data:${d.mimeType};base64,${d.data}`;
                  }
              }
          }
          return "";
      } catch (e) {
          console.error("[GeminiProvider] generateImage error:", e);
          return "";
      }
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
        if (!this.apiKey) return "ERRO: Chave API da OpenAI não configurada.";
        const messages: any[] = [{ role: "user", content: [] }];
        messages[0].content.push({ type: "text", text: prompt });
        if (imageBase64) {
            messages[0].content.push({ type: "image_url", image_url: { url: imageBase64 } });
        }
        try {
            const response = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${this.apiKey}` },
                body: JSON.stringify({ model: this.modelId, messages: messages })
            });
            const data = await response.json();
            return data.choices?.[0]?.message?.content || "";
        } catch (e) { console.error(e); throw new Error("Falha na geração"); }
    }

    async generateJSON(prompt: string): Promise<string> {
        if (!this.apiKey) return "{}";
        try {
            const response = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${this.apiKey}` },
                body: JSON.stringify({
                    model: this.modelId,
                    messages: [{ role: "user", content: prompt }],
                    response_format: { type: "json_object" }
                })
            });
            const data = await response.json();
            return data.choices?.[0]?.message?.content || "{}";
        } catch (e) { console.error(e); throw new Error("Falha na geração JSON"); }
    }

    async generateImage(_prompt: string): Promise<string> {
        // Not implemented for OpenAI in this project scope
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
            try { return await this.gemini.generateText(prompt, imageBase64); } catch {}
        }
        if (this.hasOpenAI) {
            return this.openai.generateText(prompt, imageBase64);
        }
        return "ERRO: Nenhuma chave de API configurada (Gemini ou OpenAI).";
    }

    async generateJSON(prompt: string): Promise<string> {
        if (this.hasGemini) {
            try { return await this.gemini.generateJSON(prompt); } catch {}
        }
        if (this.hasOpenAI) {
            return this.openai.generateJSON(prompt);
        }
        return "{}";
    }

    async generateImage(prompt: string): Promise<string> {
        if (this.hasGemini) {
            try { return await this.gemini.generateImage(prompt); } catch {}
        }
        return this.openai.generateImage(prompt);
    }
}

// --- SELECTOR DO PROVIDER (FALLBACK: Gemini → OpenAI) ---
const aiProvider: AIProvider = new FallbackProvider();

// --- TABELA DE CUSTOS (CRÉDITOS) ---
const CREDIT_COSTS: Record<string, number> = {
  ESTUDO_DE_CASO: 2,
  PEI: 2,
  PAEE: 2,
  PDI: 2,
  ATIVIDADE: 1,
  ATIVIDADE_IMAGEM: 2,
  ANALISE_DOCUMENTO: 2,
  OCR: 1,
  ADAPTAR_ATIVIDADE: 2,
  RELATORIO: 2,
};

export const AIService = {

  /** Retorna créditos restantes do tenant. Retorna -1 se não for possível obter. */
  async getRemainingCredits(user: User): Promise<number> {
    if (!user || !user.tenant_id) return -1;
    try {
      const { data, error } = await supabase
        .from('tenants')
        .select('creditos_ia_restantes, credits')
        .eq('id', user.tenant_id)
        .maybeSingle();
      if (error) return -1;
      const val = Number((data as any)?.creditos_ia_restantes ?? (data as any)?.credits ?? -1);
      return Number.isFinite(val) ? val : -1;
    } catch {
      return -1;
    }
  },

  async checkCredits(user: User, cost: number = 1): Promise<boolean> {
      // In production deployments, credit columns vary. Prefer creditos_ia_restantes;
      // fall back to credits if present. If table/column is missing, do NOT block generation.
      if (!user || !(user as any).tenant_id) return true;
      try {
        const { data: tenant, error } = await supabase
          .from('tenants')
          .select('creditos_ia_restantes, credits')
          .eq('id', (user as any).tenant_id)
          .maybeSingle();
        if (error) throw error;
        const remaining = Number((tenant as any)?.creditos_ia_restantes ?? (tenant as any)?.credits ?? 0);
        // If remaining is NaN, allow (better UX than blocking on schema mismatch)
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
        const { data: tenant, error } = await supabase
          .from('tenants')
          .select('creditos_ia_restantes, credits')
          .eq('id', (user as any).tenant_id)
          .maybeSingle();
        if (error) throw error;

        const current = Number((tenant as any)?.creditos_ia_restantes ?? (tenant as any)?.credits ?? 0);
        if (!Number.isFinite(current)) return;
        const next = Math.max(0, current - cost);

        // Prefer updating creditos_ia_restantes; fall back to credits.
        const patch: any = {};
        if ((tenant as any)?.creditos_ia_restantes !== undefined) patch.creditos_ia_restantes = next;
        else patch.credits = next;

        await supabase.from('tenants').update(patch).eq('id', (user as any).tenant_id);

        // credit_usage may not exist in some schemas; ignore failures.
        await supabase.from('credit_usage').insert({
          tenant_id: (user as any).tenant_id,
          user_id: user.id,
          action,
          cost,
          created_at: new Date().toISOString(),
        });
      } catch (e) {
        console.warn('[AIService] credit deduction skipped due to schema/config error', e);
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

      const jsonResult = await aiProvider.generateJSON(prompt);
      await this.deductCredits(user, type, cost);
      return jsonResult;
  },

  // Análise de documento por nome/URL — interface simplificada usada pelo StudentProfile
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

      const normalized: ActivityGenOptions = (() => {
        if (!options) return {};
        if (typeof options === 'string') return { imageBase64: options };
        return options;
      })();

      const bncc = (normalized.bnccCodes || []).filter(Boolean);
      const discipline = normalized.discipline?.trim();
      const grade = normalized.grade?.trim();
      const period = normalized.period?.trim();

      const asTeacher = normalized.teacherActivity !== false; // default true

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

      const textResult = await aiProvider.generateText(prompt, normalized.imageBase64);
      await this.deductCredits(user, 'ATIVIDADE', cost);
      return textResult;
  },

  async generateActivityImage(description: string, student: Student, user: User, options?: ActivityImageOptions): Promise<{imageUrl: string, guidance: string}> {
      const cost = 2; // Higher cost for image
      if (!(await this.checkCredits(user, cost))) throw new Error("Saldo insuficiente para imagem.");

      // 1. Generate Guidance
      const bncc = (options?.bnccCodes || []).filter(Boolean);
      const discipline = options?.discipline?.trim();
      const grade = options?.grade?.trim();
      const period = options?.period?.trim();

      // 1. Generate Guidance (teacher-facing)
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

      // 2. Generate Image
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

      // Best-effort parse to DocumentAnalysis; fallback minimal
      try {
          const parsed = JSON.parse(analysisText);
          return parsed;
      } catch {
          return { summary: analysisText } as any;
      }
  },

  // ─── IncluiLab helpers ────────────────────────────────────────────────────
  async generateFromPrompt(prompt: string, _user: User): Promise<string> {
      return aiProvider.generateJSON(prompt);
  },

  async generateFromPromptWithImage(prompt: string, imageBase64: string, _user: User): Promise<string> {
      return aiProvider.generateText(prompt, imageBase64);
  },

  /** Gera uma imagem via provider e debita créditos */
  async generateImageFromPrompt(prompt: string, user: User): Promise<string> {
      const cost = CREDIT_COSTS.ATIVIDADE_IMAGEM || 2;
      if (!(await this.checkCredits(user, cost))) throw new Error('Saldo de créditos insuficiente.');
      const result = await aiProvider.generateImage(prompt);
      if (result) await this.deductCredits(user, 'ATIVIDADE_IMAGEM', cost);
      return result;
  },

  /** Gera apenas texto (sem JSON) — usado pelo IncluiLAB */
  async generateTextFromPrompt(prompt: string, _user: User): Promise<string> {
      return aiProvider.generateText(prompt);
  },

  /** Extrai texto de uma imagem via OCR usando LLM visão */
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

  /** Gera relatório pedagógico a partir de contexto extraído + instrução */
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

  /** Adapta texto de atividade para um diagnóstico específico */
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

  /**
   * Salva atividade gerada pelo AtivaIA no Supabase.
   * Requer tabela `generated_activities` com colunas:
   *   id uuid default gen_random_uuid(), tenant_id uuid, user_id uuid,
   *   student_id uuid nullable, title text, template_type text,
   *   content text, image_count int default 0, credits_used int default 0,
   *   created_at timestamptz default now()
   *
   * Se student_id fornecido, insere também em `timeline_events`:
   *   id uuid, tenant_id uuid, student_id uuid, type text, title text,
   *   description text, linked_id uuid, author text, date date, created_at timestamptz
   */
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

    // Colunas corretas conforme schema_additions.sql:
    //   title, content, tags[], is_adapted, credits_used
    //   NÃO existem: template_type, image_count
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

    // Timeline via student_timeline (tabela correta, não timeline_events)
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
      } catch {} // non-fatal
    }

    return { id: data.id };
  },
};