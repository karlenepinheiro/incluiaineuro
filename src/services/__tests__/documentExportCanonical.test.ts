/**
 * documentExportCanonical.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Invariantes da "EXPANSÃO GERAL DAS EXPORTAÇÕES — PDF + WORD + GOOGLE DOCS".
 *
 * Parametrizado por tipo de documento:
 *   1. todo documento formal que ganha o DocumentWorkspace completo
 *      (Baixar PDF + Baixar Word + Abrir no Google Docs + Imprimir) tem, DE FATO,
 *      um renderer Word canônico (`isWordExportSupported`) — nunca um botão
 *      Google Docs sem Blob DOCX de origem;
 *   2. o nome do arquivo (download Word e Google Docs) é legível e NUNCA vaza
 *      CID, diagnóstico ou o nome completo do aluno;
 *   3. o "Abrir no Google Docs" envia ao Drive exatamente o Blob DOCX recebido
 *      (o mesmo de "Baixar Word") — sem regenerar, sem IA, sem créditos.
 *
 * Ambiente de teste é `node` puro (sem jsdom). O conteúdo do DOCX em si (campos
 * HTML → DOMParser) segue coberto por wordExportService.incluilab/*Align tests.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DocumentType } from '../../types';
import { FORMAL_WORKSPACE_DOC_TYPES } from '../../config/documentWorkspaceFlags';
import { buildWordFilename, isWordExportSupported } from '../wordExportService';
import {
  GOOGLE_DRIVE_FILE_SCOPE,
} from '../../config/googleDriveConfig';
import {
  _resetGoogleDriveSessionForTesting,
  buildGoogleDocsDisplayName,
  exportCurrentDocumentToGoogleDocs,
} from '../googleDriveExportService';

const WORKSPACE_TYPES: DocumentType[] = [
  DocumentType.ESTUDO_CASO,
  DocumentType.PEI,
  DocumentType.PAEE,
  DocumentType.PDI,
  DocumentType.DOCUMENTO_UNIFICADO_PEI_PAEE,
];

const NON_WORD_TYPES: DocumentType[] = [
  DocumentType.PLANO_ACAO_AEE,
  DocumentType.FICHA,
  DocumentType.ATIVIDADE,
  DocumentType.ESTUDO_CASO_EXTERNO,
  DocumentType.PEI_EXTERNO,
  DocumentType.PAEE_EXTERNO,
];

const CID = 'F84.0';
const DIAGNOSIS = 'Transtorno do Espectro Autista';
const student = {
  id: 'stu-1',
  name: 'Maria Eduarda da Silva Santos',
  cid: CID,
  diagnosis: DIAGNOSIS,
} as any;

describe('isWordExportSupported — cobertura parametrizada por tipo', () => {
  it.each(WORKSPACE_TYPES)('%s tem renderer Word canônico', (docType) => {
    expect(isWordExportSupported(docType)).toBe(true);
  });

  it.each(NON_WORD_TYPES)('%s NÃO tem Word canônico (fica na Fase 2)', (docType) => {
    expect(isWordExportSupported(docType)).toBe(false);
  });
});

describe('consistência DocumentWorkspace ⇄ Word canônico', () => {
  it('TODO tipo do workspace completo tem Word canônico (senão Google Docs apareceria sem Blob de origem)', () => {
    for (const docType of FORMAL_WORKSPACE_DOC_TYPES) {
      expect(isWordExportSupported(docType)).toBe(true);
    }
  });

  it('a lista do workspace é exatamente os tipos com Word canônico hoje', () => {
    expect([...FORMAL_WORKSPACE_DOC_TYPES].sort()).toEqual(WORKSPACE_TYPES.map(String).sort());
  });
});

describe('nome de arquivo — legível e sem dado sensível', () => {
  it.each(WORKSPACE_TYPES)('buildWordFilename(%s): .docx, cita tipo e código, sem CID/diagnóstico', (docType) => {
    const name = buildWordFilename(docType, student, 'A3F92C');
    expect(name.endsWith('.docx')).toBe(true);
    expect(name).not.toContain(CID);
    expect(name).not.toContain('F840');
    expect(name).not.toContain(DIAGNOSIS);
    expect(name).not.toContain('Espectro');
    expect(name).toContain('A3F92C');
  });

  it.each(WORKSPACE_TYPES)('buildGoogleDocsDisplayName(%s): só o primeiro nome, sem diagnóstico', (docType) => {
    const display = buildGoogleDocsDisplayName(String(docType), student.name, 'A3F92C');
    expect(display).toContain('Maria');
    expect(display).not.toContain('Eduarda');
    expect(display).not.toContain('Santos');
    expect(display).not.toContain(CID);
    expect(display).not.toContain(DIAGNOSIS);
    expect(display).toMatch(/A3F92C$/);
  });
});

// ─── Abrir no Google Docs: usa o Blob canônico, sem IA/créditos ───────────────

function makeFakeTokenClient() {
  return { callback: null as any, error_callback: null as any, requestAccessToken: vi.fn() };
}
function makeFakeGoogle(client: ReturnType<typeof makeFakeTokenClient>) {
  return {
    accounts: {
      oauth2: {
        initTokenClient: vi.fn((config: any) => {
          client.callback = config.callback;
          client.error_callback = config.error_callback;
          return client;
        }),
      },
    },
  };
}
function installHappyAuth() {
  const client = makeFakeTokenClient();
  client.requestAccessToken.mockImplementation(() => {
    queueMicrotask(() =>
      client.callback({ access_token: 'tok-ok', expires_in: 3600, scope: GOOGLE_DRIVE_FILE_SCOPE }),
    );
  });
  (globalThis as any).window = {
    google: makeFakeGoogle(client),
    setTimeout: (...a: any[]) => (setTimeout as any)(...a),
    clearTimeout: (...a: any[]) => (clearTimeout as any)(...a),
    open: vi.fn(() => ({})),
  };
  (globalThis as any).document = {
    querySelector: vi.fn(() => null),
    createElement: vi.fn(() => ({})),
    head: { appendChild: vi.fn(() => {}) },
  };
}

describe('Abrir no Google Docs — Blob canônico, sem IA e sem créditos', () => {
  beforeEach(() => _resetGoogleDriveSessionForTesting());
  afterEach(() => {
    delete (globalThis as any).window;
    delete (globalThis as any).document;
    vi.unstubAllGlobals();
  });

  it('envia ao Drive exatamente o Blob DOCX de generateDocxBlob (nada é regenerado)', async () => {
    installHappyAuth();
    const canonical = new Blob(['PK-conteudo-docx-canonico-unico'], {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    const generateDocxBlob = vi.fn(async () => canonical);
    const sentBodies: Blob[] = [];

    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: any, init: any) => {
        sentBodies.push(init?.body);
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: 'file-xyz', webViewLink: 'https://docs.google.com/document/d/file-xyz/edit' }),
        } as any;
      }),
    );

    const steps: string[] = [];
    const result = await exportCurrentDocumentToGoogleDocs(
      { displayName: 'PDI - Maria - A3F92C', generateDocxBlob },
      (s) => steps.push(s),
    );

    expect(generateDocxBlob).toHaveBeenCalledTimes(1);
    expect(steps).toEqual(['connecting', 'preparing', 'uploading']);
    expect(result.fileId).toBe('file-xyz');
    expect(sentBodies).toHaveLength(1);
    const sentText = await sentBodies[0].text();
    expect(sentText).toContain('conteudo-docx-canonico-unico');
    // metadados instruem o Drive a converter para Google Docs nativo
    expect(sentText).toContain('application/vnd.google-apps.document');
  });

  it('o serviço googleDriveExportService não referencia IA/gateway/créditos', () => {
    const fs = require('node:fs') as typeof import('node:fs');
    const path = require('node:path') as typeof import('node:path');
    const src = fs.readFileSync(path.resolve(__dirname, '../googleDriveExportService.ts'), 'utf8');
    expect(src).not.toMatch(/aiGateway|aiService|reserveCredits|creditsSyncGate|aiCosts/);
  });
});
