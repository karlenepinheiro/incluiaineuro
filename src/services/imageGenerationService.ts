/**
 * imageGenerationService.ts
 * Motor de geração de imagens com Imagen 4.0 (Google Gen AI).
 *
 * Método obrigatório: client.models.generateImages() ← plural
 * Modelo primário   : imagen-4.0-generate-001
 * Modelo rápido     : imagen-4.0-fast-generate-001
 *
 * Logging: cada tentativa é registrada no Supabase (ai_requests)
 * e em um buffer localStorage exportável como .txt.
 */

import { GoogleGenAI } from '@google/genai';

// ─── TIPOS ────────────────────────────────────────────────────────────────────

export interface ImageGenerationResult {
  base64DataUrl: string;
  mimeType: string;
  model: string;
  promptUsed: string;
}

export interface ImageGenLogEntry {
  timestamp: string;
  prompt: string;
  model: string;
  status: 'success' | 'error';
  error?: string;
  durationMs: number;
}

// ─── CONSTANTES ───────────────────────────────────────────────────────────────

const IMAGEN_MODEL_PRIMARY = 'imagen-4.0-generate-001';
const IMAGEN_MODEL_FAST    = 'imagen-4.0-fast-generate-001';
const LOG_STORAGE_KEY      = 'incluiai_image_generation_logs';
const MAX_LOG_ENTRIES      = 500;

// ─── HELPERS ──────────────────────────────────────────────────────────────────

/**
 * Converte Uint8Array → base64 de forma segura no browser.
 * Não usa spread (...) para evitar stack overflow em arrays grandes.
 */
function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

/**
 * Classifica o código HTTP para dar mensagens de erro específicas.
 */
function classifyHttpError(status: number, message: string): string {
  if (status === 429) {
    return `[QUOTA_EXCEEDED 429] Limite de requisições atingido. Aguarde alguns minutos antes de tentar novamente. Detalhe: ${message}`;
  }
  if (status === 403) {
    return `[PERMISSION_DENIED 403] A chave de API não tem permissão para usar o Imagen 4.0 nesta conta. Verifique se o modelo está habilitado no Google Cloud Console (projeto: ${import.meta.env.VITE_GOOGLE_PROJECT_ID || 'não configurado'}). Detalhe: ${message}`;
  }
  if (status === 400) {
    return `[BAD_REQUEST 400] Prompt rejeitado pela política de segurança do Imagen. Reformule o prompt. Detalhe: ${message}`;
  }
  if (status === 503 || status === 504) {
    return `[SERVICE_UNAVAILABLE ${status}] Serviço Imagen temporariamente indisponível. Tente novamente em instantes.`;
  }
  return `[HTTP_${status}] ${message}`;
}

/**
 * Extrai código HTTP e mensagem de um erro capturado pelo SDK.
 */
function parseApiError(e: unknown): { status: number; message: string } {
  const msg = (e as any)?.message || String(e);

  // O SDK @google/genai embute o status HTTP na mensagem
  const statusMatch = msg.match(/\b(4\d{2}|5\d{2})\b/);
  const status = statusMatch ? parseInt(statusMatch[1], 10) : 0;
  return { status, message: msg };
}

// ─── LOGGER LOCAL (localStorage + exportação .txt) ────────────────────────────

export const ImageGenLogger = {
  /**
   * Adiciona uma entrada ao log local (localStorage).
   * Mantém no máximo MAX_LOG_ENTRIES para não inflar o storage.
   */
  append(entry: ImageGenLogEntry): void {
    try {
      const raw = localStorage.getItem(LOG_STORAGE_KEY);
      const logs: ImageGenLogEntry[] = raw ? JSON.parse(raw) : [];
      logs.push(entry);
      if (logs.length > MAX_LOG_ENTRIES) logs.splice(0, logs.length - MAX_LOG_ENTRIES);
      localStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(logs));
    } catch {
      // localStorage pode estar desabilitado — falha silenciosa
    }
  },

  /**
   * Retorna todas as entradas de log.
   */
  getAll(): ImageGenLogEntry[] {
    try {
      const raw = localStorage.getItem(LOG_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  /**
   * Exporta os logs como arquivo .txt (mesmo formato solicitado).
   * Chame ImageGenLogger.exportTxt() no console do browser para baixar.
   */
  exportTxt(): void {
    const logs = this.getAll();
    if (!logs.length) {
      console.info('[ImageGenLogger] Nenhum log encontrado.');
      return;
    }

    const lines = logs.map((e) => [
      `Data/Hora : ${e.timestamp}`,
      `Modelo    : ${e.model}`,
      `Prompt    : ${e.prompt}`,
      `Status    : ${e.status === 'success' ? 'SUCESSO' : `ERRO — ${e.error}`}`,
      `Duração   : ${e.durationMs}ms`,
      '─'.repeat(60),
    ].join('\n'));

    const content = `LOGS DE GERAÇÃO DE IMAGENS — IncluiAI\n${'='.repeat(60)}\n\n${lines.join('\n')}`;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `logs_geracao_${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  },

  /**
   * Limpa todos os logs locais.
   */
  clear(): void {
    localStorage.removeItem(LOG_STORAGE_KEY);
  },
};

// ─── SERVIÇO PRINCIPAL ────────────────────────────────────────────────────────

export class ImageGenerationService {
  private static _client: GoogleGenAI | null = null;

  private static get client(): GoogleGenAI {
    if (!this._client) {
      // ── Leitura via import.meta.env (padrão Vite — sem cast) ──────────────
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
      if (!apiKey) {
        throw new Error(
          'CONFIG_IMAGEN: VITE_GEMINI_API_KEY não configurada no .env. ' +
          'Adicione a chave e reinicie o servidor Vite.'
        );
      }

      const projectId = import.meta.env.VITE_GOOGLE_PROJECT_ID as string | undefined;
      if (!projectId) {
        throw new Error(
          'CONFIG_IMAGEN: VITE_GOOGLE_PROJECT_ID não configurada no .env. ' +
          'O sistema usa OBRIGATORIAMENTE o Vertex AI (projeto Google Cloud) ' +
          'para consumir o bônus de créditos. Defina a variável e reinicie o Vite.'
        );
      }

      const location = (import.meta.env.VITE_GOOGLE_LOCATION as string | undefined) || 'us-central1';

      // ── Vertex AI obrigatório — nunca usa Developer API como fallback ──────
      // O SDK @google/genai com vertexai:true roteia para
      // https://{location}-aiplatform.googleapis.com — endpoint com CORS
      // liberado para chamadas browser via API Key.
      this._client = new GoogleGenAI({
        vertexai: true,
        project:  projectId,
        location,
        apiKey,
      } as any);

      console.info(
        `[Imagen4] Cliente Vertex AI inicializado — projeto: ${projectId}, location: ${location}`
      );
    }
    return this._client;
  }

  /**
   * Constrói o prompt seguro para imagens pedagógicas inclusivas.
   */
  private static buildSafePrompt(userPrompt: string): string {
    return [
      'Ilustração educativa infantil para impressão pedagógica (A4).',
      'Traço limpo, alto contraste, poucos elementos visuais, SEM texto na imagem.',
      'Estilo: livro didático inclusivo, cores suaves, fundo branco, amigável.',
      `Tema: ${userPrompt}`,
    ].join(' ');
  }

  /**
   * Registra no Supabase via AiAuditService (importação dinâmica para evitar ciclo).
   */
  private static async logToSupabase(params: {
    status: 'success' | 'failed';
    model: string;
    prompt: string;
    durationMs: number;
    error?: string;
    tenantId?: string;
    userId?: string;
  }): Promise<void> {
    try {
      const { AiAuditService } = await import('./persistenceService');
      const reqId = await AiAuditService.logRequest({
        tenantId:    params.tenantId || 'unknown',
        userId:      params.userId   || 'unknown',
        requestType: 'image_generation',
        model:       params.model,
        inputData:   { prompt: params.prompt.slice(0, 500) },
        creditsConsumed: 0, // custo contabilizado externamente pelo AIService
      });
      if (reqId) {
        await AiAuditService.completeRequest(reqId, {
          status:     params.status,
          latencyMs:  params.durationMs,
          outputType: 'image',
          // Se houve erro, registra como content para auditoria
          ...(params.error ? { content: `ERRO: ${params.error.slice(0, 500)}` } : {}),
        });
      }
    } catch {
      // logging nunca deve quebrar a operação principal
    }
  }

  /**
   * Gera uma imagem via Imagen 4.0.
   *
   * Usa `client.models.generateImages()` (PLURAL — obrigatório para Imagen).
   *
   * @param prompt  Descrição do tema da imagem (sem dados pessoais de alunos)
   * @param fast    Se true, usa imagen-4.0-fast-generate-001 (mais rápido, menor qualidade)
   * @param tenantId / userId  Para auditoria no Supabase
   */
  static async generate(
    prompt: string,
    options?: {
      fast?: boolean;
      tenantId?: string;
      userId?: string;
    }
  ): Promise<ImageGenerationResult> {
    const model = options?.fast ? IMAGEN_MODEL_FAST : IMAGEN_MODEL_PRIMARY;
    const safePrompt = this.buildSafePrompt(prompt);
    const startMs = Date.now();

    console.info(`[Imagen4] Gerando imagem — modelo: ${model}`);
    console.info(`[Imagen4] Prompt: ${safePrompt}`);

    try {
      // ── CHAMADA PRINCIPAL: plural obrigatório ──────────────────────────────
      const response = await this.client.models.generateImages({
        model,
        prompt: safePrompt,
        config: {
          numberOfImages: 1,
          outputMimeType: 'image/jpeg',
        },
      });

      const durationMs = Date.now() - startMs;
      const imageBytes = response.generatedImages?.[0]?.image?.imageBytes;

      if (!imageBytes || imageBytes.length === 0) {
        throw new Error('Imagen 4.0 não retornou bytes de imagem na resposta.');
      }

      const base64 = uint8ToBase64(imageBytes as unknown as Uint8Array);
      const base64DataUrl = `data:image/jpeg;base64,${base64}`;

      console.info(`[Imagen4] Sucesso em ${durationMs}ms — ${imageBytes.length} bytes`);

      // Registro de log
      const logEntry: ImageGenLogEntry = {
        timestamp: new Date().toISOString(),
        prompt: safePrompt,
        model,
        status: 'success',
        durationMs,
      };
      ImageGenLogger.append(logEntry);
      void this.logToSupabase({ status: 'success', model, prompt: safePrompt, durationMs, ...options });

      return { base64DataUrl, mimeType: 'image/jpeg', model, promptUsed: safePrompt };

    } catch (e: unknown) {
      const durationMs = Date.now() - startMs;
      const { status, message } = parseApiError(e);
      const classifiedError = status > 0 ? classifyHttpError(status, message) : message;

      console.error(`[Imagen4] ERRO após ${durationMs}ms:`, classifiedError);

      // Registro de log
      const logEntry: ImageGenLogEntry = {
        timestamp: new Date().toISOString(),
        prompt: safePrompt,
        model,
        status: 'error',
        error: classifiedError,
        durationMs,
      };
      ImageGenLogger.append(logEntry);
      void this.logToSupabase({ status: 'failed', model, prompt: safePrompt, durationMs, error: classifiedError, ...options });

      throw new Error(`Imagen4 (${model}): ${classifiedError}`);
    }
  }

  /**
   * Tenta Imagen 4.0 primário; se falhar por quota ou erro transitório,
   * tenta a variante fast como segundo estágio antes de propagar o erro.
   */
  static async generateWithFallback(
    prompt: string,
    options?: { tenantId?: string; userId?: string }
  ): Promise<ImageGenerationResult> {
    try {
      return await this.generate(prompt, { fast: false, ...options });
    } catch (primaryErr: unknown) {
      const msg = (primaryErr as Error)?.message || '';
      // Tenta o modelo fast apenas em erros não-permanentes (quota, serviço indisponível)
      const isRetryable = msg.includes('429') || msg.includes('503') || msg.includes('504') || msg.includes('QUOTA');
      if (isRetryable) {
        console.warn('[Imagen4] Primário falhou com erro retryable, tentando fast model...');
        return await this.generate(prompt, { fast: true, ...options });
      }
      throw primaryErr;
    }
  }
}
