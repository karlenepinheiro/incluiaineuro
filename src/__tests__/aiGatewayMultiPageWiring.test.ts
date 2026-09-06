/**
 * aiGatewayMultiPageWiring.test.ts — Correção de emergência C-1 (06/09/2026)
 * ─────────────────────────────────────────────────────────────────────────────
 * A regressão C-1: o frontend envia `images[]` / `pageNumbers[]` para leitura
 * multipágina de PDF, mas o `ai-gateway` passou a ignorar `images[]` e só ler
 * `imageBase64` — o Gemini recebia o prompt SEM as imagens.
 *
 * Estes testes leem o código-fonte (mesmo padrão de
 * documentRecoveryAndIdempotency.test.ts — o projeto não roda a Edge Function
 * nem o provider real aqui) e comprovam:
 *   K. nenhum campo multimodal é descartado silenciosamente
 *   L. o prompt textual existente continua no payload
 *   B/C/D. images[] e pageNumbers[] chegam ao provider
 *   H. formato inválido é rejeitado ANTES da reserva/chamada ao provider
 *   I/J. o fluxo de créditos (reserva/commit/release) NÃO foi tocado — uma
 *        importação continua sendo UMA operação, sem cobrança por página
 *   — friendlyError / retry / fallback / OpenAI / router NÃO reintroduzidos.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');

const indexTs = read('supabase/functions/ai-gateway/index.ts');
const vertexTs = read('supabase/functions/ai-gateway/_vertex.ts');
const gatewayService = read('src/services/aiGatewayService.ts');
const docImport = read('src/services/studentDocumentImportService.ts');

describe('C-1 · index.ts aceita e repassa images[] / pageNumbers[]', () => {
  it('desestrutura images e pageNumbers do body', () => {
    expect(indexTs).toMatch(/images:\s*rawImages/);
    expect(indexTs).toMatch(/pageNumbers:\s*rawPageNumbers/);
  });

  it('valida images ANTES de reservar crédito (falha cedo, 400, sem custo)', () => {
    const validateIdx = indexTs.indexOf('validateGatewayImages(rawImages)');
    const reserveIdx = indexTs.indexOf('reserveCredits(adminDb');
    const providerIdx = indexTs.indexOf('generateGeminiJSON(');
    expect(validateIdx).toBeGreaterThan(0);
    expect(validateIdx).toBeLessThan(reserveIdx);
    expect(validateIdx).toBeLessThan(providerIdx);
    expect(indexTs).toMatch(/friendlyImagesValidationError\(imagesValidation\.reason!\),\s*400/);
  });

  it('valida pageNumbers contra images.length (só quando há images)', () => {
    expect(indexTs).toMatch(/images\s*\?\s*validateGatewayPageNumbers\(rawPageNumbers,\s*images\.length\)/);
    expect(indexTs).toMatch(/friendlyPageNumbersValidationError\(pageNumbersValidation\.reason!\),\s*400/);
  });

  it('passa images e pageNumbers para generateGeminiJSON (task json/document)', () => {
    expect(indexTs).toMatch(/generateGeminiJSON\(finalPrompt\.trim\(\),\s*img,\s*images,\s*pageNumbers\)/);
  });

  it('task text continua sem images (nada enviado hoje usa text + images)', () => {
    expect(indexTs).toMatch(/generateGeminiText\(finalPrompt\.trim\(\),\s*img\)/);
  });
});

describe('C-1 · _vertex.ts compõe as partes multimodais do Gemini', () => {
  it('generateGeminiJSON aceita (prompt, imageBase64?, images?, pageNumbers?)', () => {
    expect(vertexTs).toMatch(
      /generateGeminiJSON\([\s\S]{0,160}imageBase64\?:\s*string,[\s\S]{0,80}images\?:\s*string\[\],[\s\S]{0,80}pageNumbers\?:\s*number\[\]/,
    );
  });

  it('images tem precedência sobre imageBase64, com fallback para imageBase64 único', () => {
    expect(vertexTs).toMatch(
      /const allImages = images && images\.length > 0 \? images : \(imageBase64 \? \[imageBase64\] : \[\]\)/,
    );
  });

  it('L · o prompt textual continua como primeira parte do payload', () => {
    expect(vertexTs).toMatch(/const parts: GeminiPart\[\] = \[\{ text: prompt \}, \.\.\.buildGeminiMultiImageParts\(allImages, pageNumbers\)\]/);
  });

  it('endpoint, modelo e autenticação inalterados', () => {
    expect(vertexTs).toContain("const GEMINI_MODEL   = 'gemini-2.5-flash'");
    expect(vertexTs).toContain('https://generativelanguage.googleapis.com/v1beta/models');
    expect(vertexTs).toContain("Deno.env.get('GEMINI_API_KEY')");
  });
});

describe('C-1 · frontend JÁ envia os campos (nenhuma mudança de frontend necessária)', () => {
  it('aiGatewayService declara images[] e pageNumbers[] e serializa o req inteiro', () => {
    expect(gatewayService).toMatch(/images\?:\s*string\[\]/);
    expect(gatewayService).toMatch(/pageNumbers\?:\s*number\[\]/);
    expect(gatewayService).toMatch(/body:\s*JSON\.stringify\(req\)/);
  });

  it('studentDocumentImportService envia images + pageNumbers na importação visual', () => {
    const visualCall = docImport.slice(
      docImport.indexOf("requestType:     'document_import_visual'") - 600,
      docImport.indexOf("requestType:     'document_import_visual'") + 200,
    );
    expect(visualCall).toMatch(/\bimages,/);
    expect(visualCall).toMatch(/pageNumbers:\s*pagesIncluded/);
  });
});

describe('I/J · fluxo de créditos NÃO foi tocado — uma importação é UMA operação', () => {
  it('exatamente uma reserva, um commit e o mesmo operationId base derivando reserve/commit/release', () => {
    expect(indexTs.match(/await reserveCredits\(adminDb/g) ?? []).toHaveLength(1);
    expect(indexTs.match(/await commitReservedCredits\(adminDb/g) ?? []).toHaveLength(1);
    expect(indexTs).toMatch(/operationId\?\.trim\(\) \|\| crypto\.randomUUID\(\)/);
    expect(indexTs).toContain('`${baseOperationId}:reserve`');
    expect(indexTs).toContain('`${baseOperationId}:commit`');
    expect(indexTs).toContain('`${baseOperationId}:release`');
  });

  it('não existe reserva/commit por página (nenhuma reserva dentro de um loop de images)', () => {
    expect(indexTs).not.toMatch(/images\.(forEach|map)\([\s\S]{0,200}reserveCredits/);
    expect(indexTs).not.toMatch(/for\s*\([^)]*images[\s\S]{0,200}reserveCredits/);
  });

  it('a validação estrutural continua ANTES do commit (release já existente)', () => {
    const validateIdx = indexTs.indexOf('validateStructuredResult(parsedDocument');
    const commitIdx = indexTs.indexOf('creditsRemaining = await commitReservedCredits');
    expect(validateIdx).toBeGreaterThan(0);
    expect(commitIdx).toBeGreaterThan(validateIdx);
  });
});

describe('Fora de escopo C-1 — NÃO reintroduzido', () => {
  it('friendlyError permanece byte-a-byte (o bug do includes("429") NÃO foi corrigido agora)', () => {
    expect(indexTs).toContain(
      "if (raw.includes('429') || raw.includes('QUOTA')) return 'Limite de uso da IA atingido. Aguarde alguns instantes.';",
    );
    // nenhuma mensagem nova de erro de provider foi adicionada
    expect(indexTs).not.toContain('OPENAI_RATE_LIMIT');
    expect(indexTs).not.toContain('RESOURCE_EXHAUSTED');
  });

  it('retry continua desabilitado (retries = 0) — não foi alterado', () => {
    expect(indexTs).toMatch(/callAIWithRetryAndTimeout\(aiCall,\s*0,\s*90_000\)/);
  });

  it('nenhum router / multiprovider / OpenAI no gateway', () => {
    expect(indexTs).not.toMatch(/_router\.ts|_openaiProvider\.ts|_geminiProvider\.ts|_modelConfig\.ts|_types\.ts/);
    expect(indexTs).not.toMatch(/selectProviderChain|getRouterConfig|createOpenAIProvider|shouldFallbackToNextProvider/);
    expect(vertexTs).not.toMatch(/openai|OpenAI/i);
  });

  it('_multiPageParts.ts restaurado só com o adapter Gemini (sem helpers OpenAI)', () => {
    const mpp = read('supabase/functions/ai-gateway/_multiPageParts.ts');
    expect(mpp).toContain('buildGeminiMultiImageParts');
    expect(mpp).not.toContain('buildOpenAIMultiImageContent');
    expect(mpp).not.toContain('OpenAIContentPart');
  });
});
