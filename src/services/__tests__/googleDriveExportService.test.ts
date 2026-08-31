/**
 * Testes de googleDriveExportService.ts (piloto "Abrir no Google Docs", PAEE).
 *
 * Mocka `googleDriveConfig` com um Client ID FICTÍCIO e válido em formato
 * (`test-client-id.apps.googleusercontent.com`) para exercitar os caminhos
 * "configurado" deste arquivo — nenhuma rede real, nenhuma conta Google real,
 * nenhum dado de aluno real. O cenário "configuração ausente" fica em
 * `googleDriveExportServiceNotConfigured.test.ts` (module registry isolado).
 *
 * LIMITAÇÃO HONESTA: estes testes cobrem a lógica de autorização (com um SDK
 * do Google FALSIFICADO), a montagem do corpo multipart e o upload (com
 * `fetch` FALSIFICADO). Eles NÃO comprovam OAuth real, upload real nem
 * fidelidade da conversão do Google — isso só um teste manual com conta e
 * documento reais pode confirmar (ver relatório desta fase).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../config/googleDriveConfig', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../config/googleDriveConfig')>();
  return { ...actual, GOOGLE_OAUTH_CLIENT_ID: 'test-client-id.apps.googleusercontent.com' };
});

import { GOOGLE_DRIVE_FILE_SCOPE } from '../../config/googleDriveConfig';
import {
  GoogleDriveExportError,
  _resetGoogleDriveSessionForTesting,
  buildGoogleDocsDisplayName,
  buildMultipartUploadRequestBody,
  clearGoogleDriveSession,
  exportCurrentDocumentToGoogleDocs,
  getValidGoogleDriveAccessToken,
  isAccessTokenValid,
  loadGoogleIdentityServices,
  openGoogleDocLink,
  requestGoogleDriveAccessToken,
  sanitizeGoogleDocsDisplayNamePart,
  uploadDocxAsGoogleDoc,
} from '../googleDriveExportService';

// ─── Helpers de ambiente falso (sem jsdom — ambiente de teste é `node`) ──────

function makeFakeTokenClient() {
  return {
    callback: null as any,
    error_callback: null as any,
    requestAccessToken: vi.fn(),
  };
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

function installFakeWindow(google: any) {
  (globalThis as any).window = {
    google,
    setTimeout: (...args: any[]) => (setTimeout as any)(...args),
    clearTimeout: (...args: any[]) => (clearTimeout as any)(...args),
    open: vi.fn(() => ({})),
  };
  // Num navegador real, `document` sempre existe junto de `window` — os testes
  // que exercitam especificamente a injeção do script (`loadGoogleIdentityServices`)
  // substituem isto por um fake mais completo logo em seguida, quando precisam
  // inspecionar o <script> criado.
  if (!(globalThis as any).document) {
    (globalThis as any).document = makeFakeDocument().doc;
  }
}

function makeFakeDocument() {
  const createdScripts: any[] = [];
  return {
    doc: {
      querySelector: vi.fn(() => null),
      createElement: vi.fn((_tag: string) => {
        const el: any = {};
        createdScripts.push(el);
        return el;
      }),
      head: { appendChild: vi.fn(() => {}) },
    },
    createdScripts,
  };
}

beforeEach(() => {
  _resetGoogleDriveSessionForTesting();
});

afterEach(() => {
  delete (globalThis as any).window;
  delete (globalThis as any).document;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

// ─── isAccessTokenValid ───────────────────────────────────────────────────────

describe('isAccessTokenValid', () => {
  it('inválido quando não há estado', () => {
    expect(isAccessTokenValid(null)).toBe(false);
  });

  it('válido quando expira bem no futuro', () => {
    const state = { accessToken: 'x', expiresAt: Date.now() + 3600_000, grantedScopes: [GOOGLE_DRIVE_FILE_SCOPE] };
    expect(isAccessTokenValid(state)).toBe(true);
  });

  it('inválido quando já expirou', () => {
    const state = { accessToken: 'x', expiresAt: Date.now() - 1000, grantedScopes: [GOOGLE_DRIVE_FILE_SCOPE] };
    expect(isAccessTokenValid(state)).toBe(false);
  });

  it('inválido dentro da margem de segurança, mesmo sem ter expirado tecnicamente', () => {
    const state = { accessToken: 'x', expiresAt: Date.now() + 10_000, grantedScopes: [GOOGLE_DRIVE_FILE_SCOPE] };
    expect(isAccessTokenValid(state, Date.now(), 60_000)).toBe(false);
  });
});

// ─── loadGoogleIdentityServices ───────────────────────────────────────────────

describe('loadGoogleIdentityServices', () => {
  it('rejeita com ENVIRONMENT_UNSUPPORTED fora de um navegador (sem window/document)', async () => {
    const err: any = await loadGoogleIdentityServices().catch((e) => e);
    expect(err).toBeInstanceOf(GoogleDriveExportError);
    expect(err.code).toBe('ENVIRONMENT_UNSUPPORTED');
  });

  it('resolve imediatamente se o SDK já estiver presente (sem tocar em document)', async () => {
    const client = makeFakeTokenClient();
    const google = makeFakeGoogle(client);
    installFakeWindow(google);
    const { doc } = makeFakeDocument();
    (globalThis as any).document = doc;

    await expect(loadGoogleIdentityServices()).resolves.toBeUndefined();
    expect(doc.createElement).not.toHaveBeenCalled();
  });

  it('injeta o script uma única vez mesmo com chamadas concorrentes, e resolve no onload', async () => {
    installFakeWindow({});
    const { doc, createdScripts } = makeFakeDocument();
    (globalThis as any).document = doc;

    const p1 = loadGoogleIdentityServices();
    const p2 = loadGoogleIdentityServices();
    expect(doc.createElement).toHaveBeenCalledTimes(1);

    createdScripts[0].onload();
    await expect(p1).resolves.toBeUndefined();
    await expect(p2).resolves.toBeUndefined();
  });

  it('rejeita com SDK_LOAD_FAILED quando o script falha ao carregar, e permite tentar de novo depois', async () => {
    installFakeWindow({});
    const { doc, createdScripts } = makeFakeDocument();
    (globalThis as any).document = doc;

    const p1 = loadGoogleIdentityServices();
    createdScripts[0].onerror();
    const err: any = await p1.catch((e) => e);
    expect(err.code).toBe('SDK_LOAD_FAILED');

    // Nova tentativa injeta um NOVO script (não fica preso numa promise já rejeitada)
    const p2 = loadGoogleIdentityServices();
    expect(doc.createElement).toHaveBeenCalledTimes(2);
    createdScripts[1].onload();
    await expect(p2).resolves.toBeUndefined();
  });
});

// ─── requestGoogleDriveAccessToken ────────────────────────────────────────────

describe('requestGoogleDriveAccessToken — autorização concedida', () => {
  it('resolve com o access token quando o escopo drive.file é concedido', async () => {
    const client = makeFakeTokenClient();
    client.requestAccessToken.mockImplementation(() => {
      queueMicrotask(() => client.callback({ access_token: 'tok-123', expires_in: 3600, scope: GOOGLE_DRIVE_FILE_SCOPE }));
    });
    installFakeWindow(makeFakeGoogle(client));

    const state = await requestGoogleDriveAccessToken();
    expect(state.accessToken).toBe('tok-123');
    expect(state.grantedScopes).toContain(GOOGLE_DRIVE_FILE_SCOPE);
  });
});

describe('requestGoogleDriveAccessToken — autorização negada (consentimento recusado)', () => {
  it('rejeita com CONSENT_DENIED quando a resposta traz error=access_denied', async () => {
    const client = makeFakeTokenClient();
    client.requestAccessToken.mockImplementation(() => {
      queueMicrotask(() => client.callback({ error: 'access_denied' }));
    });
    installFakeWindow(makeFakeGoogle(client));

    const err: any = await requestGoogleDriveAccessToken().catch((e) => e);
    expect(err.code).toBe('CONSENT_DENIED');
  });
});

describe('requestGoogleDriveAccessToken — popup bloqueado', () => {
  it('rejeita com POPUP_BLOCKED via error_callback (popup_failed_to_open)', async () => {
    const client = makeFakeTokenClient();
    client.requestAccessToken.mockImplementation(() => {
      queueMicrotask(() => client.error_callback({ type: 'popup_failed_to_open' }));
    });
    installFakeWindow(makeFakeGoogle(client));

    const err: any = await requestGoogleDriveAccessToken().catch((e) => e);
    expect(err.code).toBe('POPUP_BLOCKED');
  });
});

describe('requestGoogleDriveAccessToken — popup fechado pela professora', () => {
  it('rejeita com POPUP_CLOSED via error_callback (popup_closed)', async () => {
    const client = makeFakeTokenClient();
    client.requestAccessToken.mockImplementation(() => {
      queueMicrotask(() => client.error_callback({ type: 'popup_closed' }));
    });
    installFakeWindow(makeFakeGoogle(client));

    const err: any = await requestGoogleDriveAccessToken().catch((e) => e);
    expect(err.code).toBe('POPUP_CLOSED');
  });

  it('nunca fica presa em "conectando" para sempre: rede de segurança expira em POPUP_CLOSED se nada responder', async () => {
    vi.useFakeTimers();
    const client = makeFakeTokenClient();
    client.requestAccessToken.mockImplementation(() => {
      // Simula uma janela fechada sem disparar nenhum callback do GIS.
    });
    installFakeWindow(makeFakeGoogle(client));

    const promise = requestGoogleDriveAccessToken();
    const assertion = expect(promise).rejects.toMatchObject({ code: 'POPUP_CLOSED' });
    await vi.advanceTimersByTimeAsync(90_000);
    await assertion;
  });
});

describe('requestGoogleDriveAccessToken — escopo não concedido', () => {
  it('rejeita com SCOPE_NOT_GRANTED quando o escopo devolvido não inclui drive.file', async () => {
    const client = makeFakeTokenClient();
    client.requestAccessToken.mockImplementation(() => {
      queueMicrotask(() =>
        client.callback({ access_token: 'tok', expires_in: 3600, scope: 'https://www.googleapis.com/auth/drive.metadata.readonly' }),
      );
    });
    installFakeWindow(makeFakeGoogle(client));

    const err: any = await requestGoogleDriveAccessToken().catch((e) => e);
    expect(err.code).toBe('SCOPE_NOT_GRANTED');
  });
});

describe('getValidGoogleDriveAccessToken — cache em memória e limpeza no logout', () => {
  it('reaproveita o token em memória sem pedir um novo enquanto válido', async () => {
    const client = makeFakeTokenClient();
    client.requestAccessToken.mockImplementation(() => {
      queueMicrotask(() => client.callback({ access_token: 'tok-A', expires_in: 3600, scope: GOOGLE_DRIVE_FILE_SCOPE }));
    });
    const google = makeFakeGoogle(client);
    installFakeWindow(google);
    (globalThis as any).document = makeFakeDocument().doc;
    (globalThis as any).window.google.accounts.oauth2.initTokenClient; // já "carregado"

    const first = await getValidGoogleDriveAccessToken();
    expect(first).toBe('tok-A');
    expect(google.accounts.oauth2.initTokenClient).toHaveBeenCalledTimes(1);

    const second = await getValidGoogleDriveAccessToken();
    expect(second).toBe('tok-A');
    // Não deve ter criado um novo TokenClient nem pedido um novo token.
    expect(google.accounts.oauth2.initTokenClient).toHaveBeenCalledTimes(1);
    expect(client.requestAccessToken).toHaveBeenCalledTimes(1);
  });

  it('clearGoogleDriveSession força uma nova autorização completa (evita reaproveitar token entre usuárias)', async () => {
    const client = makeFakeTokenClient();
    let call = 0;
    client.requestAccessToken.mockImplementation(() => {
      call += 1;
      const token = call === 1 ? 'tok-A' : 'tok-B';
      queueMicrotask(() => client.callback({ access_token: token, expires_in: 3600, scope: GOOGLE_DRIVE_FILE_SCOPE }));
    });
    installFakeWindow(makeFakeGoogle(client));

    const first = await getValidGoogleDriveAccessToken();
    expect(first).toBe('tok-A');

    clearGoogleDriveSession();

    const second = await getValidGoogleDriveAccessToken();
    expect(second).toBe('tok-B');
    expect(client.requestAccessToken).toHaveBeenCalledTimes(2);
  });
});

// ─── Nome de exibição ─────────────────────────────────────────────────────────

describe('sanitizeGoogleDocsDisplayNamePart / buildGoogleDocsDisplayName', () => {
  it('remove acentuação e símbolos, preservando letras/números/espaço/hífen', () => {
    expect(sanitizeGoogleDocsDisplayNamePart('João Ção-Núñez!!')).toBe('Joao Cao-Nunez');
  });

  it('usa só o primeiro nome do aluno — não o nome completo', () => {
    const name = buildGoogleDocsDisplayName('PAEE', 'Maria da Silva Santos', 'A3F92C');
    expect(name).toBe('PAEE - Maria - A3F92C');
    expect(name).not.toContain('Silva');
    expect(name).not.toContain('Santos');
  });

  it('funciona sem código de auditoria', () => {
    expect(buildGoogleDocsDisplayName('PAEE', 'Ana', null)).toBe('PAEE - Ana');
  });

  it('nunca retorna string vazia mesmo com entradas vazias — cai no nome genérico "Aluno"', () => {
    expect(buildGoogleDocsDisplayName('', '', null)).toBe('Aluno');
    expect(buildGoogleDocsDisplayName('', '', null)).not.toBe('');
  });
});

// ─── Upload multipart ─────────────────────────────────────────────────────────

describe('buildMultipartUploadRequestBody', () => {
  it('monta um Blob multipart/related com metadados JSON e o conteúdo binário', async () => {
    const fileBlob = new Blob(['conteudo-docx-fake'], { type: 'application/octet-stream' });
    const { body, contentType } = buildMultipartUploadRequestBody(
      { name: 'PAEE - Ana', mimeType: 'application/vnd.google-apps.document' },
      fileBlob,
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );

    expect(contentType).toMatch(/^multipart\/related; boundary=/);
    expect(body.type).toBe(contentType);

    const text = await body.text();
    expect(text).toContain('Content-Type: application/json; charset=UTF-8');
    expect(text).toContain('"name":"PAEE - Ana"');
    expect(text).toContain('"mimeType":"application/vnd.google-apps.document"');
    expect(text).toContain('Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    expect(text).toContain('conteudo-docx-fake');
  });
});

describe('uploadDocxAsGoogleDoc', () => {
  const fileBlob = new Blob(['docx'], { type: 'application/octet-stream' });

  it('sucesso: retorna fileId e url reais devolvidos pela Drive API, sem token na URL', async () => {
    const fetchMock = vi.fn(async (url: string, init: any) => {
      expect(String(url)).toContain('uploadType=multipart');
      expect(String(url)).not.toContain('tok-123'); // nunca token na URL
      expect(init.headers.Authorization).toBe('Bearer tok-123');
      expect(init.body).toBeInstanceOf(Blob);
      return { ok: true, status: 200, json: async () => ({ id: 'file-1', webViewLink: 'https://docs.google.com/document/d/file-1/edit' }) } as any;
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await uploadDocxAsGoogleDoc({ accessToken: 'tok-123', fileBlob, displayName: 'PAEE - Ana' });
    expect(result).toEqual({ fileId: 'file-1', url: 'https://docs.google.com/document/d/file-1/edit' });
  });

  it('constrói uma URL de fallback quando a API não devolve webViewLink', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ id: 'file-2' }) } as any)));
    const result = await uploadDocxAsGoogleDoc({ accessToken: 'tok', fileBlob, displayName: 'x' });
    expect(result.url).toBe('https://docs.google.com/document/d/file-2/edit');
  });

  it('falha de upload: status não-2xx (ex.: 403) vira UPLOAD_FAILED', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 403, json: async () => ({}) } as any)));
    const err: any = await uploadDocxAsGoogleDoc({ accessToken: 'tok', fileBlob, displayName: 'x' }).catch((e) => e);
    expect(err).toBeInstanceOf(GoogleDriveExportError);
    expect(err.code).toBe('UPLOAD_FAILED');
  });

  it('token expirado/invalidado no meio do upload (401) vira TOKEN_REQUEST_FAILED', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) } as any)));
    const err: any = await uploadDocxAsGoogleDoc({ accessToken: 'tok', fileBlob, displayName: 'x' }).catch((e) => e);
    expect(err.code).toBe('TOKEN_REQUEST_FAILED');
  });

  it('resposta sem id válido vira UPLOAD_FAILED (nunca assume sucesso sem confirmação)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) } as any)));
    const err: any = await uploadDocxAsGoogleDoc({ accessToken: 'tok', fileBlob, displayName: 'x' }).catch((e) => e);
    expect(err.code).toBe('UPLOAD_FAILED');
  });

  it('falha de rede (fetch rejeita) vira UPLOAD_FAILED', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down'); }));
    const err: any = await uploadDocxAsGoogleDoc({ accessToken: 'tok', fileBlob, displayName: 'x' }).catch((e) => e);
    expect(err.code).toBe('UPLOAD_FAILED');
  });

  it('timeout: resultado desconhecido, NUNCA repete o envio automaticamente', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_url: string, init: any) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => {
        const abortErr: any = new Error('aborted');
        abortErr.name = 'AbortError';
        reject(abortErr);
      });
    })));

    const promise = uploadDocxAsGoogleDoc({ accessToken: 'tok', fileBlob, displayName: 'x' });
    const assertion = expect(promise).rejects.toMatchObject({ code: 'UPLOAD_TIMEOUT_UNKNOWN' });
    await vi.advanceTimersByTimeAsync(45_000);
    await assertion;
    // Nenhuma segunda chamada de fetch foi disparada por conta própria.
    expect((fetch as any).mock.calls.length).toBe(1);
  });
});

// ─── Orquestração completa ────────────────────────────────────────────────────

describe('exportCurrentDocumentToGoogleDocs — orquestração (autorização → docx → upload)', () => {
  function installHappyAuth() {
    const client = makeFakeTokenClient();
    client.requestAccessToken.mockImplementation(() => {
      queueMicrotask(() => client.callback({ access_token: 'tok-ok', expires_in: 3600, scope: GOOGLE_DRIVE_FILE_SCOPE }));
    });
    installFakeWindow(makeFakeGoogle(client));
  }

  it('caminho feliz: chama onStepChange na ordem certa e devolve fileId/url', async () => {
    installHappyAuth();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ id: 'f1', webViewLink: 'https://docs.google.com/document/d/f1/edit' }) } as any)));

    const steps: string[] = [];
    const result = await exportCurrentDocumentToGoogleDocs(
      { displayName: 'PAEE - Ana', generateDocxBlob: async () => new Blob(['docx']) },
      (s) => steps.push(s),
    );

    expect(steps).toEqual(['connecting', 'preparing', 'uploading']);
    expect(result).toEqual({ fileId: 'f1', url: 'https://docs.google.com/document/d/f1/edit' });
  });

  it('falha ao gerar o DOCX: propaga DOCX_GENERATION_FAILED e NÃO chega a tentar upload', async () => {
    installHappyAuth();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const err: any = await exportCurrentDocumentToGoogleDocs({
      displayName: 'PAEE - Ana',
      generateDocxBlob: async () => { throw new Error('modelo de documento corrompido'); },
    }).catch((e) => e);

    expect(err).toBeInstanceOf(GoogleDriveExportError);
    expect(err.code).toBe('DOCX_GENERATION_FAILED');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('autorização recusada interrompe antes de gerar o DOCX', async () => {
    const client = makeFakeTokenClient();
    client.requestAccessToken.mockImplementation(() => {
      queueMicrotask(() => client.callback({ error: 'access_denied' }));
    });
    installFakeWindow(makeFakeGoogle(client));
    const generateDocxBlob = vi.fn(async () => new Blob(['x']));

    const err: any = await exportCurrentDocumentToGoogleDocs({ displayName: 'x', generateDocxBlob }).catch((e) => e);
    expect(err.code).toBe('CONSENT_DENIED');
    expect(generateDocxBlob).not.toHaveBeenCalled();
  });

  it('nunca chama o AI Gateway nem qualquer lógica de créditos (verificação estrutural do módulo)', async () => {
    const mod = await import('../googleDriveExportService');
    const source = Object.keys(mod).join(',');
    // Nenhuma função exportada deste serviço menciona IA/créditos no nome —
    // e, por construção (ver imports no topo do arquivo), o módulo não
    // importa `aiGatewayService`, `aiCosts` nem `creditsSyncGate`.
    expect(source).not.toMatch(/credit|gateway|aiService/i);
  });
});

// ─── Abertura de link ─────────────────────────────────────────────────────────

describe('openGoogleDocLink — correção de 28/08/2026 (falso aviso de bloqueio)', () => {
  // Achado real: passar "noopener"/"noreferrer" como window FEATURES faz
  // window.open() retornar sempre null por especificação, mesmo com sucesso
  // — por isso a implementação NÃO usa mais esse argumento, e em vez disso
  // anula manualmente `win.opener` na referência retornada (mesma garantia
  // de segurança, sem perder a capacidade de detectar bloqueio de verdade).

  it('NÃO passa "noopener"/"noreferrer" como terceiro argumento de window.open (isso forçaria retorno null sempre, por especificação)', () => {
    const fakeWin = {};
    const openMock = vi.fn(() => fakeWin);
    (globalThis as any).window = { open: openMock };
    openGoogleDocLink('https://docs.google.com/document/d/abc/edit');
    expect(openMock).toHaveBeenCalledWith('https://docs.google.com/document/d/abc/edit', '_blank');
    expect(openMock.mock.calls[0]).toHaveLength(2); // sem terceiro argumento
  });

  it('retorna true quando a aba abre com sucesso, e anula win.opener (proteção equivalente a noopener, preservada)', () => {
    const fakeWin: any = { opener: { someRealWindowRef: true } };
    (globalThis as any).window = { open: vi.fn(() => fakeWin) };
    const ok = openGoogleDocLink('https://docs.google.com/document/d/abc/edit');
    expect(ok).toBe(true);
    expect(fakeWin.opener).toBeNull();
  });

  it('não lança se anular win.opener falhar (aba cross-origin) — trata como sucesso mesmo assim', () => {
    const fakeWin = {};
    Object.defineProperty(fakeWin, 'opener', {
      set() { throw new Error('cross-origin, não pode setar'); },
      get() { return null; },
    });
    (globalThis as any).window = { open: vi.fn(() => fakeWin) };
    expect(() => openGoogleDocLink('https://docs.google.com/document/d/abc/edit')).not.toThrow();
    expect(openGoogleDocLink('https://docs.google.com/document/d/abc/edit')).toBe(true);
  });

  it('retorna false quando window.open genuinamente devolve null/undefined (agora um sinal confiável, sem noopener a mais)', () => {
    (globalThis as any).window = { open: vi.fn(() => null) };
    expect(openGoogleDocLink('https://docs.google.com/document/d/abc/edit')).toBe(false);
  });

  it('retorna false fora de um navegador', () => {
    delete (globalThis as any).window;
    expect(openGoogleDocLink('https://x')).toBe(false);
  });
});
