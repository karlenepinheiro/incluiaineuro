/**
 * documentRecoveryAndIdempotency.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Seções 4 e 5 da correção. O projeto não usa jsdom/Testing Library — estes
 * testes leem o código-fonte (mesmo padrão de SidebarFooterSimplification.test).
 *
 * Cobre:
 *  - recuperação segura: geração OK + save falho → conteúdo preservado + retry;
 *  - retry de save NÃO chama a IA;
 *  - retry de save NÃO reserva/debita crédito (não passa pelo Gateway);
 *  - retry protegido contra duplo clique / duplicação;
 *  - operationId por tentativa de geração + trava síncrona (genLock);
 *  - o resultado gerado NÃO vai para localStorage/sessionStorage.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');

const actionPlanTab = read('src/components/ActionPlanTab.tsx');
const aeeActionPlanTab = read('src/components/AEEActionPlanTab.tsx');
const profileTab = read('src/components/IntelligentProfileTab.tsx');
const aiService = read('src/services/aiService.ts');
const gatewayIndex = read('supabase/functions/ai-gateway/index.ts');

const COMPONENTS: Array<[string, string]> = [
  ['ActionPlanTab', actionPlanTab],
  ['AEEActionPlanTab', aeeActionPlanTab],
  ['IntelligentProfileTab', profileTab],
];

describe('Recuperação segura em falha de banco (Seção 4)', () => {
  it.each(COMPONENTS)('%s guarda o resultado gerado em estado de sessão (não em storage)', (_name, src) => {
    // estado de recuperação em memória
    expect(src).toMatch(/pendingPlan|pendingSave/);
    // NUNCA escrita/leitura de storage do browser para o conteúdo gerado
    expect(src).not.toMatch(/(localStorage|sessionStorage|indexedDB)\s*\.\s*(setItem|getItem|put|add)/);
  });

  it.each(COMPONENTS)('%s exibe a mensagem canônica de recuperação', (_name, src) => {
    expect(src).toContain('não foi possível salvá-lo');
    expect(src).toMatch(/sem gerar ou consumir novos créditos|não gera novo (plano|conteúdo) nem consome créditos/);
  });

  it.each(COMPONENTS)('%s tem uma função de persistência separada da geração', (_name, src) => {
    expect(src).toMatch(/const persistPlan|const persistProfile/);
    expect(src).toMatch(/handleRetrySave/);
  });
});

describe('Retry de save NÃO chama a IA (Seção 4)', () => {
  it('ActionPlanTab.persistPlan não referencia AIService', () => {
    const fn = actionPlanTab.slice(actionPlanTab.indexOf('const persistPlan'), actionPlanTab.indexOf('const handleGenerate'));
    expect(fn).not.toContain('AIService');
    expect(fn).toContain('ActionPlanService.save');
  });
  it('AEEActionPlanTab.persistPlan não referencia AIService', () => {
    const fn = aeeActionPlanTab.slice(aeeActionPlanTab.indexOf('const persistPlan'), aeeActionPlanTab.indexOf('const handleGenerate'));
    expect(fn).not.toContain('AIService');
    expect(fn).toContain('AEEActionPlanService.save');
  });
  it('IntelligentProfileTab.persistProfile não referencia AIService', () => {
    const fn = profileTab.slice(profileTab.indexOf('const persistProfile'), profileTab.indexOf('const handleRetrySave'));
    expect(fn).not.toContain('AIService');
    expect(fn).toContain('IntelligentProfileService.save');
  });
  it.each(COMPONENTS)('%s: handleRetrySave chama a persistência com o resultado guardado', (_name, src) => {
    const fn = src.slice(src.indexOf('const handleRetrySave'), src.indexOf('const handleRetrySave') + 260);
    expect(fn).toMatch(/persistPlan\(pendingPlan\)|persistProfile\(\s*pendingSave/);
  });
});

describe('Retry protegido contra duplicação (Seção 4/5)', () => {
  it.each(COMPONENTS)('%s: handleRetrySave aborta se já estiver salvando', (_name, src) => {
    const fn = src.slice(src.indexOf('const handleRetrySave'), src.indexOf('const handleRetrySave') + 260);
    expect(fn).toMatch(/savingPending/);
    expect(fn).toMatch(/return/);
  });
  it.each(COMPONENTS)('%s: botão de retry fica disabled durante o save', (_name, src) => {
    expect(src).toMatch(/disabled=\{savingPending\}/);
  });
});

describe('Idempotência da geração (Seção 5)', () => {
  it.each(COMPONENTS)('%s: trava síncrona genLock em handleGenerate', (_name, src) => {
    expect(src).toContain('genLock');
    expect(src).toMatch(/genLock\.current\)\s*return/);
    expect(src).toMatch(/genLock\.current = true/);
    expect(src).toMatch(/genLock\.current = false/);
  });

  it.each(COMPONENTS)('%s: gera um operationId por tentativa e o repassa ao serviço', (_name, src) => {
    expect(src).toMatch(/const operationId =/);
    expect(src).toMatch(/crypto\?\.randomUUID/);
    expect(src).toMatch(/generate\w+\([\s\S]*?operationId[,\s)]/);
  });

  it('aiService: as 3 gerações aceitam e repassam operationId ao callAIGateway', () => {
    expect(aiService).toMatch(/generateActionPlan\([\s\S]{0,180}operationId\?: string/);
    expect(aiService).toMatch(/generateAEEActionPlan\([\s\S]{0,220}operationId\?: string/);
    expect(aiService).toMatch(/generateIntelligentProfile\([\s\S]{0,140}operationId\?: string/);
    // cada callAIGateway com requestType dos 3 fluxos carrega operationId por perto
    expect(aiService).toMatch(/requestType: 'plano_acao',[\s\S]{0,40}operationId,/);
    expect(aiService).toMatch(/requestType: 'plano_acao_aee',[\s\S]{0,40}operationId,/);
    expect(aiService).toMatch(/requestType: 'perfil_inteligente',[\s\S]{0,40}operationId,/);
  });

  it('Gateway já deriva reserve/commit/release do mesmo operationId base', () => {
    expect(gatewayIndex).toContain(':reserve');
    expect(gatewayIndex).toContain(':commit');
    expect(gatewayIndex).toContain(':release');
    expect(gatewayIndex).toMatch(/operationId\?\.trim\(\) \|\| crypto\.randomUUID\(\)/);
  });
});

describe('Validação estrutural roda ANTES do commit do crédito (Seção 3)', () => {
  it('index.ts: validateStructuredResult é chamado dentro do try, antes do commit', () => {
    const tryStart = gatewayIndex.indexOf('const t0 = Date.now()');
    const commitIdx = gatewayIndex.indexOf('commitReservedCredits = await commitReservedCredits');
    const validateIdx = gatewayIndex.indexOf('validateStructuredResult(parsedDocument');
    const sanitizeIdx = gatewayIndex.indexOf('sanitizeStructuredResult(parsedDocument');
    expect(sanitizeIdx).toBeGreaterThan(tryStart);
    expect(validateIdx).toBeGreaterThan(sanitizeIdx);
    // o commit acontece FORA/DEPOIS do bloco try onde a validação lança
    expect(gatewayIndex.indexOf('creditsRemaining = await commitReservedCredits')).toBeGreaterThan(validateIdx);
  });
  it('index.ts: falha de validação lança UNUSABLE_RESULT (caminho de release já existente)', () => {
    expect(gatewayIndex).toMatch(/throw new Error\(\s*`UNUSABLE_RESULT/);
  });
});
