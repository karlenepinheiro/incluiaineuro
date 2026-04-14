/**
 * imageGenerationService.ts
 * Cliente HTTP para a rota serverless /api/generate-image.
 *
 * A geração real de imagem (Imagen 4.0 via Vertex AI) roda no servidor
 * para contornar a restrição "browser runtime" do SDK Google.
 *
 * Este arquivo:
 *   - Envia POST /api/generate-image com o prompt
 *   - Recebe { base64DataUrl, model, promptUsed } do servidor
 *   - Mantém log local (localStorage) e log Supabase para auditoria
 */

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

const LOG_STORAGE_KEY  = 'incluiai_image_generation_logs';
const MAX_LOG_ENTRIES  = 500;
const API_ENDPOINT     = '/api/generate-image';

// ─── LOGGER LOCAL (localStorage + exportação .txt) ────────────────────────────

export const ImageGenLogger = {
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

  getAll(): ImageGenLogEntry[] {
    try {
      const raw = localStorage.getItem(LOG_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

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
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `logs_geracao_${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  },

  clear(): void {
    localStorage.removeItem(LOG_STORAGE_KEY);
  },
};

// ─── LOG SUPABASE (auditoria) ─────────────────────────────────────────────────

async function logToSupabase(params: {
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
      tenantId:        params.tenantId    || 'unknown',
      userId:          params.userId      || 'unknown',
      requestType:     'image_generation',
      model:           params.model,
      inputData:       { prompt: params.prompt.slice(0, 500) },
      creditsConsumed: 0, // custo contabilizado externamente pelo AIService
    });
    if (reqId) {
      await AiAuditService.completeRequest(reqId, {
        status:     params.status,
        latencyMs:  params.durationMs,
        outputType: 'image',
        ...(params.error ? { content: `ERRO: ${params.error.slice(0, 500)}` } : {}),
      });
    }
  } catch {
    // logging nunca deve quebrar a operação principal
  }
}

// ─── SERVIÇO PRINCIPAL ────────────────────────────────────────────────────────

export class ImageGenerationService {
  /**
   * Chama POST /api/generate-image e retorna a imagem como base64 data URL.
   *
   * @param prompt    Descrição do tema (sem dados pessoais de alunos)
   * @param options   tenantId / userId para auditoria no Supabase
   */
  static async generate(
    prompt: string,
    options?: {
      fast?: boolean;      // ignorado — o servidor decide o modelo
      tenantId?: string;
      userId?: string;
    }
  ): Promise<ImageGenerationResult> {
    const startMs = Date.now();

    console.info('[ImageGenerationService] Chamando /api/generate-image...');

    let responseData: any;
    try {
      const response = await fetch(API_ENDPOINT, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ prompt }),
      });

      responseData = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));

      if (!response.ok) {
        const errMsg = responseData?.error || `HTTP ${response.status}`;
        // Log detalhado para facilitar diagnóstico no console
        console.error('[ImageGenerationService] ✗ Servidor retornou erro:');
        console.error('  Mensagem:', errMsg);
        if (responseData?.details) {
          (responseData.details as string[]).forEach((d: string, i: number) =>
            console.error(`  [${i + 1}] ${d}`)
          );
        }
        throw new Error(errMsg);
      }
    } catch (e: unknown) {
      const durationMs = Date.now() - startMs;
      const errMsg = (e as Error)?.message || String(e);

      ImageGenLogger.append({
        timestamp: new Date().toISOString(),
        prompt,
        model: 'unknown',
        status: 'error',
        error: errMsg,
        durationMs,
      });
      void logToSupabase({
        status: 'failed', model: 'unknown', prompt,
        durationMs, error: errMsg, ...options,
      });

      throw e;
    }

    const durationMs = Date.now() - startMs;
    const { base64DataUrl, model, promptUsed } = responseData;

    console.info(`[ImageGenerationService] ✓ Imagem recebida — modelo: ${model} em ${durationMs}ms`);

    ImageGenLogger.append({
      timestamp: new Date().toISOString(),
      prompt: promptUsed || prompt,
      model,
      status: 'success',
      durationMs,
    });
    void logToSupabase({
      status: 'success', model, prompt: promptUsed || prompt,
      durationMs, ...options,
    });

    return {
      base64DataUrl,
      mimeType: 'image/jpeg',
      model,
      promptUsed: promptUsed || prompt,
    };
  }

  /**
   * Alias compatível com o código existente.
   * O servidor já tenta o modelo fast automaticamente em erros transitórios.
   */
  static async generateWithFallback(
    prompt: string,
    options?: { tenantId?: string; userId?: string }
  ): Promise<ImageGenerationResult> {
    return this.generate(prompt, options);
  }
}
