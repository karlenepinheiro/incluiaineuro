/**
 * aiGatewayFriendlyError.test.ts — Correção A-1 (06/09/2026)
 * ─────────────────────────────────────────────────────────────────────────────
 * O bug: `friendlyError` (ai-gateway) e `friendlyAIError` (frontend) usavam
 * `raw.includes('429')` / `raw.includes('403')`. Isso casava com o DETALHE de
 * erros de validação — "[len=429]", "at position 4291", "position 403" — e
 * mostrava "Limite de uso da IA atingido" / "Sem permissao" ao cliente sem
 * quota nem problema de permissão.
 *
 * A correção: reconhecer CONFIG / TIMEOUT / VALIDATION_ERROR / UNUSABLE_RESULT
 * ANTES da análise de 429/403, e um guarda (`looksLikeParseOffset`) que impede
 * que um offset de parse/tamanho seja lido como status HTTP. Nenhuma mensagem
 * foi alterada.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { friendlyError, looksLikeParseOffset } from '../../supabase/functions/ai-gateway/_friendlyError.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');

const MSG_QUOTA      = 'Limite de uso da IA atingido. Aguarde alguns instantes.';
const MSG_PERMISSION = 'Sem permissao para acessar o modelo de IA. Verifique a service account.';
const MSG_TIMEOUT    = 'Tempo de resposta da IA excedido. Tente novamente.';
const MSG_VALIDATION = 'A IA gerou um documento com formato invalido. Tente novamente.';
const MSG_UNUSABLE   = 'Nao foi possivel identificar dados utilizaveis no documento. Nenhum credito foi consumido.';
const MSG_CFG_TEXT   = 'Servico de texto IA nao configurado. Contate o suporte.';
const MSG_CFG_IMAGE  = 'Servico de imagem IA nao configurado. Contate o suporte.';
const MSG_GENERIC    = 'Ocorreu um erro ao processar sua solicitacao. Tente novamente.';

describe('A-1 · friendlyError — falsos positivos de 429/403 eliminados', () => {
  it('1. UNUSABLE_RESULT: SUSPICIOUSLY_SHORT [len=429] → resultado inutilizável, NÃO limite de uso', () => {
    const out = friendlyError('UNUSABLE_RESULT: SUSPICIOUSLY_SHORT [len=429]');
    expect(out).toBe(MSG_UNUSABLE);
    expect(out).not.toBe(MSG_QUOTA);
  });

  it('2. VALIDATION_ERROR: JSON parse error at position 4291 → formato inválido, NÃO limite de uso', () => {
    const out = friendlyError('VALIDATION_ERROR: O formato retornado pela IA está inconsistente. (JSON parse error at position 4291)');
    expect(out).toBe(MSG_VALIDATION);
    expect(out).not.toBe(MSG_QUOTA);
  });

  it('3. VALIDATION_ERROR: JSON parse error at position 403 → formato inválido, NÃO permissão', () => {
    const out = friendlyError('VALIDATION_ERROR: JSON parse error at position 403');
    expect(out).toBe(MSG_VALIDATION);
    expect(out).not.toBe(MSG_PERMISSION);
  });

  it('6. strings nuas com offsets NÃO viram quota/permissão', () => {
    for (const raw of ['position 429', 'position 4291', 'position 403', '[len=429]', 'erro em len=403 do buffer']) {
      const out = friendlyError(raw);
      expect(out, raw).not.toBe(MSG_QUOTA);
      expect(out, raw).not.toBe(MSG_PERMISSION);
      expect(out, raw).toBe(MSG_GENERIC);
    }
  });
});

describe('A-1 · friendlyError — erros reais continuam reconhecidos', () => {
  it('4. 429 real do provider → limite de uso', () => {
    expect(friendlyError('Gemini 429: Resource has been exhausted (e.g. check quota).')).toBe(MSG_QUOTA);
    expect(friendlyError('Gemini 429: rate limit')).toBe(MSG_QUOTA);
  });

  it('5. QUOTA → limite de uso', () => {
    expect(friendlyError('Imagen imagen-4.0 500: {"error":{"status":"QUOTA_EXCEEDED"}}')).toBe(MSG_QUOTA);
  });

  it('6. 403 real do provider → mensagem de permissão', () => {
    expect(friendlyError('Gemini 403: Permission denied on resource project.')).toBe(MSG_PERMISSION);
  });

  it('7. timeout → mensagem de timeout', () => {
    expect(friendlyError('TIMEOUT_EXCEEDED')).toBe(MSG_TIMEOUT);
    expect(friendlyError('The operation was aborted (AbortError)')).toBe(MSG_TIMEOUT);
  });

  it('8. CONFIG_GEMINI → serviço de texto não configurado', () => {
    expect(friendlyError('CONFIG_GEMINI')).toBe(MSG_CFG_TEXT);
  });

  it('9. CONFIG_VERTEX_IMAGE → serviço de imagem não configurado', () => {
    expect(friendlyError('CONFIG_VERTEX_IMAGE: Imagen imagen-4.0 403: ...')).toBe(MSG_CFG_IMAGE);
  });

  it('10. erro genérico → mensagem genérica', () => {
    expect(friendlyError('Gemini 500: Internal error encountered.')).toBe(MSG_GENERIC);
    expect(friendlyError('algo completamente inesperado')).toBe(MSG_GENERIC);
  });
});

describe('A-1 · looksLikeParseOffset', () => {
  it('reconhece offsets de parse/tamanho', () => {
    for (const s of ['[len=429]', 'len = 12', 'at position 4291', 'position 403', 'x position 7 y']) {
      expect(looksLikeParseOffset(s), s).toBe(true);
    }
  });
  it('NÃO marca mensagens de status HTTP nem texto comum', () => {
    for (const s of ['Gemini 429: quota', 'Gemini 403: denied', 'QUOTA_EXCEEDED', 'golden retriever', 'swollen', '']) {
      expect(looksLikeParseOffset(s), s).toBe(false);
    }
  });
});

describe('A-1 · frontend friendlyAIError — mesmo guarda (consistência)', () => {
  const aiService = read('src/services/aiService.ts');

  it('a linha de quota do frontend é guardada por looksLikeParseOffset', () => {
    const fn = aiService.slice(
      aiService.indexOf('export function friendlyAIError'),
      aiService.indexOf('export function friendlyAIError') + 2600,
    );
    expect(fn).toContain('const looksLikeParseOffset = /\\blen\\s*=\\s*\\d+|position\\s+\\d+/i.test(raw);');
    expect(fn).toContain("!looksLikeParseOffset && (raw.includes('quota') || raw.includes('429') || raw.includes('rate limit'))");
  });

  it('nenhuma mensagem do frontend foi alterada e nenhum ramo novo criado', () => {
    expect(aiService).toContain("return 'Limite de uso da IA atingido. Aguarde alguns instantes e tente novamente.';");
    expect(aiService).toContain("return 'A IA demorou demais para responder. Tente novamente.';");
    // não foram adicionados ramos VALIDATION_ERROR/UNUSABLE_RESULT ao frontend
    expect(aiService).not.toMatch(/friendlyAIError[\s\S]{0,900}raw\.includes\('VALIDATION_ERROR'\)/);
    expect(aiService).not.toMatch(/friendlyAIError[\s\S]{0,900}raw\.includes\('UNUSABLE_RESULT'\)/);
  });
});

// ─── GARDA ESPECIAL: nada fora do escopo A-1 foi tocado ──────────────────────

describe('GARDA · C-1 (multipágina) e créditos permanecem intactos', () => {
  const PROTECTED = [
    'supabase/functions/ai-gateway/_imagesValidation.ts',
    'supabase/functions/ai-gateway/_multiPageParts.ts',
    'supabase/functions/ai-gateway/_vertex.ts',
    'supabase/functions/ai-gateway/_credits.ts',
    'supabase/functions/ai-gateway/_aiUtils.ts',
    'supabase/functions/ai-gateway/_usability.ts',
    'supabase/functions/ai-gateway/_resultValidation.ts',
  ];

  it.each(PROTECTED)('%s idêntico ao commit cea6ab8', (file) => {
    const diff = execFileSync('git', ['diff', 'cea6ab8', '--', file], { cwd: root, encoding: 'utf8' });
    expect(diff.trim()).toBe('');
  });

  const indexTs = read('supabase/functions/ai-gateway/index.ts');

  it('bloco multipágina do cea6ab8 permaneceu: validação antes da reserva + repasse ao provider', () => {
    const validateIdx = indexTs.indexOf('validateGatewayImages(rawImages)');
    const reserveIdx = indexTs.indexOf('reserveCredits(adminDb');
    expect(validateIdx).toBeGreaterThan(0);
    expect(validateIdx).toBeLessThan(reserveIdx);
    expect(indexTs).toMatch(/generateGeminiJSON\(finalPrompt\.trim\(\),\s*img,\s*images,\s*pageNumbers\)/);
  });

  it('nenhuma função de crédito alterada: exatamente 1 reserve, 1 commit, releases derivados do operationId', () => {
    expect(indexTs.match(/await reserveCredits\(adminDb/g) ?? []).toHaveLength(1);
    expect(indexTs.match(/await commitReservedCredits\(adminDb/g) ?? []).toHaveLength(1);
    expect(indexTs).toContain('`${baseOperationId}:reserve`');
    expect(indexTs).toContain('`${baseOperationId}:commit`');
    expect(indexTs).toContain('`${baseOperationId}:release`');
    expect(indexTs).not.toContain('expires_at');
  });

  it('retries continua 0; timeout 90_000 intacto', () => {
    expect(indexTs).toMatch(/callAIWithRetryAndTimeout\(aiCall,\s*0,\s*90_000\)/);
  });

  it('nenhum router / OpenAI / fallback adicionado', () => {
    expect(indexTs).not.toMatch(/_router\.ts|_openaiProvider\.ts|_geminiProvider\.ts|selectProviderChain|createOpenAIProvider|shouldFallbackToNextProvider/);
    const friendly = read('supabase/functions/ai-gateway/_friendlyError.ts');
    expect(friendly).not.toMatch(/openai|OpenAI|router|fallback/i);
  });
});
