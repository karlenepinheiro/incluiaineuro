/**
 * googleDriveExportService.ts
 * Integração "Abrir no Google Docs" (piloto PAEE, 27/08/2026).
 *
 * ARQUITETURA (Google Identity Services — "token model", conforme
 * https://developers.google.com/identity/oauth2/web/guides/use-token-model):
 *   1. Carrega o SDK do Google (`accounts.google.com/gsi/client`) sob demanda,
 *      só quando a professora clica no botão — nunca no carregamento da página.
 *   2. Pede um ACCESS TOKEN TEMPORÁRIO (não um "login"), com o escopo mínimo
 *      `drive.file` (https://developers.google.com/workspace/drive/api/guides/api-specific-auth)
 *      — acesso somente aos arquivos que o próprio IncluiAI criar, nunca ao
 *      Drive inteiro da professora.
 *   3. Envia o DOCX (já gerado pelo mesmo pipeline de "Baixar Word") direto do
 *      navegador para a Google Drive API, com upload multipart
 *      (https://developers.google.com/workspace/drive/api/guides/manage-uploads):
 *      MIME de origem = DOCX, MIME de destino nos metadados =
 *      `application/vnd.google-apps.document` (conversão nativa para Google
 *      Docs feita pelo próprio Google).
 *   4. Não existe backend nesta integração: nenhuma Edge Function, nenhuma
 *      tabela nova, nenhum refresh token, nenhuma conta de serviço. O upload
 *      vai direto do navegador da professora para a Drive API dela, com o
 *      token dela.
 *
 * SEGURANÇA E PRIVACIDADE (obrigatório, não opcional):
 *   - O access token vive SÓ em memória (variável de módulo) — nunca em
 *     localStorage/sessionStorage/banco. `clearGoogleDriveSession()` é
 *     chamada no logout do IncluiAI (ver App.tsx) para nunca vazar entre
 *     usuárias do mesmo navegador.
 *   - Nenhum conteúdo do documento, nome de aluno ou token é logado
 *     (console.error aqui só registra CÓDIGOS de erro, nunca corpo/token).
 *   - Nenhum token entra em URL — sempre em header `Authorization`.
 *   - Nenhum compartilhamento público é criado — o Drive já cria arquivos
 *     privados por padrão; esta integração não chama `permissions.create`.
 *
 * O QUE ESTE ARQUIVO NÃO FAZ (fora do escopo desta fase, de propósito):
 *   - Não usa a Google Docs API (só a Drive API, para upload/conversão).
 *   - Não implementa refresh token nem renovação silenciosa — token expirado
 *     significa pedir um novo (nova interação, sem popup se o navegador ainda
 *     tiver consentimento em cache, mas sempre uma ação real do SDK do Google,
 *     nunca algo automático do IncluiAI).
 *   - Não sincroniza de volta o que a professora edita no Google Docs.
 */

import {
  DOCX_MIME_TYPE,
  GOOGLE_DOC_MIME_TYPE,
  GOOGLE_DRIVE_FILE_SCOPE,
  GOOGLE_OAUTH_CLIENT_ID,
} from '../config/googleDriveConfig';

// ─── Erros tipados ────────────────────────────────────────────────────────────

export type GoogleDriveExportErrorCode =
  | 'ENVIRONMENT_UNSUPPORTED'
  | 'NOT_CONFIGURED'
  | 'SDK_LOAD_FAILED'
  | 'POPUP_BLOCKED'
  | 'POPUP_CLOSED'
  | 'CONSENT_DENIED'
  | 'SCOPE_NOT_GRANTED'
  | 'TOKEN_REQUEST_FAILED'
  | 'DOCX_GENERATION_FAILED'
  | 'UPLOAD_FAILED'
  | 'UPLOAD_TIMEOUT_UNKNOWN';

export class GoogleDriveExportError extends Error {
  code: GoogleDriveExportErrorCode;
  constructor(code: GoogleDriveExportErrorCode, message: string) {
    super(message);
    this.name = 'GoogleDriveExportError';
    this.code = code;
  }
}

// ─── Estado do token — SOMENTE em memória, nunca persistido ──────────────────

export interface GoogleDriveTokenState {
  accessToken: string;
  expiresAt: number; // epoch ms
  grantedScopes: string[];
}

let tokenState: GoogleDriveTokenState | null = null;
let tokenClient: any = null;
let gisLoadPromise: Promise<void> | null = null;

/**
 * Limpa por completo o estado desta integração (token + client OAuth em
 * memória). Deve ser chamada no logout do IncluiAI (ver `handleLogout` em
 * App.tsx) para nunca reaproveitar autorização entre contas diferentes no
 * mesmo navegador. Segura para chamar mesmo se nada foi autorizado ainda.
 */
export function clearGoogleDriveSession(): void {
  tokenState = null;
  tokenClient = null;
}

/** Só para testes — nunca usar em código de produto. */
export function _resetGoogleDriveSessionForTesting(): void {
  clearGoogleDriveSession();
  gisLoadPromise = null;
}

/**
 * Verifica se um token ainda é válido, com uma margem de segurança (60s por
 * padrão) para não usar um token que expira no meio de uma chamada de rede.
 * Função pura — testável sem depender de `Date.now()` real.
 */
export function isAccessTokenValid(
  state: GoogleDriveTokenState | null,
  now: number = Date.now(),
  skewMs = 60_000,
): boolean {
  if (!state) return false;
  return state.expiresAt - skewMs > now;
}

// ─── Carregamento do SDK (Google Identity Services) ──────────────────────────

const GIS_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

/**
 * Injeta o script do GIS sob demanda (nunca no load da página). Resolve
 * imediatamente se o SDK já estiver presente (ex.: segunda exportação na
 * mesma sessão). Rejeita com `SDK_LOAD_FAILED` se o script falhar ao carregar
 * (rede indisponível, bloqueador de conteúdo, etc.) — nesse caso, uma nova
 * chamada tenta de novo (não fica "travado" numa promise rejeitada antiga).
 */
export function loadGoogleIdentityServices(): Promise<void> {
  const w = (globalThis as any).window;
  const d = (globalThis as any).document;
  if (!w || !d) {
    return Promise.reject(
      new GoogleDriveExportError('ENVIRONMENT_UNSUPPORTED', 'Este recurso só funciona em um navegador.'),
    );
  }
  if (w.google?.accounts?.oauth2) {
    return Promise.resolve();
  }
  if (gisLoadPromise) return gisLoadPromise;

  gisLoadPromise = new Promise<void>((resolve, reject) => {
    const onError = () =>
      reject(
        new GoogleDriveExportError(
          'SDK_LOAD_FAILED',
          'Não foi possível carregar o serviço de autorização do Google. Verifique sua conexão e tente novamente.',
        ),
      );

    const existing = d.querySelector?.(`script[src="${GIS_SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', onError);
      return;
    }

    const script = d.createElement('script');
    script.src = GIS_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = onError;
    (d.head ?? d.body ?? d).appendChild(script);
  });

  // Se falhar, permite tentar carregar de novo na próxima chamada em vez de
  // ficar preso numa promise já rejeitada para sempre.
  gisLoadPromise.catch(() => {
    gisLoadPromise = null;
  });

  return gisLoadPromise;
}

// ─── Classificação de erros do GIS ────────────────────────────────────────────

function classifyTokenResponseError(errorCode: string): GoogleDriveExportError {
  if (errorCode === 'access_denied') {
    return new GoogleDriveExportError(
      'CONSENT_DENIED',
      'Você não autorizou o acesso à sua conta Google. Nada foi enviado.',
    );
  }
  if (errorCode === 'popup_closed' || errorCode === 'popup_closed_by_user') {
    return new GoogleDriveExportError(
      'POPUP_CLOSED',
      'A janela de autorização foi fechada antes de concluir. Tente novamente.',
    );
  }
  return new GoogleDriveExportError(
    'TOKEN_REQUEST_FAILED',
    'Não foi possível autorizar o acesso ao Google. Tente novamente.',
  );
}

function classifyTokenClientError(err: any): GoogleDriveExportError {
  const type = err?.type ?? '';
  if (type === 'popup_failed_to_open') {
    return new GoogleDriveExportError(
      'POPUP_BLOCKED',
      'O navegador bloqueou a janela de autorização do Google. Permita pop-ups para este site e tente novamente.',
    );
  }
  if (type === 'popup_closed') {
    return new GoogleDriveExportError(
      'POPUP_CLOSED',
      'A janela de autorização foi fechada antes de concluir. Tente novamente.',
    );
  }
  return new GoogleDriveExportError(
    'TOKEN_REQUEST_FAILED',
    'Não foi possível autorizar o acesso ao Google. Tente novamente.',
  );
}

/**
 * Tempo máximo de espera pela interação da professora com o popup do Google.
 * Rede de segurança para o requisito "evitar que a interface fique
 * permanentemente bloqueada se a pessoa fechar a janela de autorização" —
 * cobre qualquer caso em que o `error_callback` do GIS não seja disparado
 * (comportamento não garantido em 100% dos navegadores/versões).
 */
const AUTHORIZATION_SAFETY_TIMEOUT_MS = 90_000;

/**
 * Pede um access token OAuth (escopo `drive.file`) via Google Identity
 * Services. Cria o `TokenClient` uma única vez e o reaproveita entre
 * chamadas (reatribuindo `callback`/`error_callback` a cada pedido — padrão
 * documentado pelo próprio Google para o "token model"). Requer
 * `loadGoogleIdentityServices()` já resolvido.
 */
export function requestGoogleDriveAccessToken(): Promise<GoogleDriveTokenState> {
  if (!GOOGLE_OAUTH_CLIENT_ID) {
    return Promise.reject(
      new GoogleDriveExportError('NOT_CONFIGURED', 'A integração com o Google Docs não está configurada.'),
    );
  }
  const w = (globalThis as any).window;
  if (!w?.google?.accounts?.oauth2) {
    return Promise.reject(
      new GoogleDriveExportError(
        'SDK_LOAD_FAILED',
        'O serviço de autorização do Google ainda não carregou. Tente novamente.',
      ),
    );
  }

  return new Promise<GoogleDriveTokenState>((resolve, reject) => {
    let settled = false;
    let safetyTimer: any = null;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      if (safetyTimer) w.clearTimeout(safetyTimer);
      fn();
    };

    if (!tokenClient) {
      tokenClient = w.google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_OAUTH_CLIENT_ID,
        scope: GOOGLE_DRIVE_FILE_SCOPE,
        callback: () => {},
        error_callback: () => {},
      });
    }

    tokenClient.callback = (response: any) => {
      finish(() => {
        if (response?.error) {
          reject(classifyTokenResponseError(response.error));
          return;
        }
        const grantedScopes = String(response?.scope ?? '').split(' ').filter(Boolean);
        if (!grantedScopes.includes(GOOGLE_DRIVE_FILE_SCOPE)) {
          reject(
            new GoogleDriveExportError(
              'SCOPE_NOT_GRANTED',
              'A permissão necessária (acesso a arquivos criados pelo IncluiAI) não foi concedida.',
            ),
          );
          return;
        }
        const state: GoogleDriveTokenState = {
          accessToken: response.access_token,
          expiresAt: Date.now() + (Number(response.expires_in) || 0) * 1000,
          grantedScopes,
        };
        tokenState = state;
        resolve(state);
      });
    };

    tokenClient.error_callback = (err: any) => {
      finish(() => reject(classifyTokenClientError(err)));
    };

    safetyTimer = w.setTimeout(() => {
      finish(() =>
        reject(
          new GoogleDriveExportError(
            'POPUP_CLOSED',
            'Não foi possível concluir a autorização a tempo. Tente novamente.',
          ),
        ),
      );
    }, AUTHORIZATION_SAFETY_TIMEOUT_MS);

    tokenClient.requestAccessToken({ prompt: '' });
  });
}

/** Retorna um token válido em memória, ou pede um novo (carregando o SDK antes, se preciso). */
export async function getValidGoogleDriveAccessToken(): Promise<string> {
  if (isAccessTokenValid(tokenState)) {
    return tokenState!.accessToken;
  }
  await loadGoogleIdentityServices();
  const state = await requestGoogleDriveAccessToken();
  return state.accessToken;
}

// ─── Nome de exibição do documento (minimiza dados pessoais) ─────────────────

/** Remove acentuação e caracteres fora de [letras/números/espaço/hífen]. */
const COMBINING_DIACRITICS_RE = new RegExp('[\\u0300-\\u036f]', 'g');

export function sanitizeGoogleDocsDisplayNamePart(value: string): string {
  return value
    .normalize('NFKD')
    .replace(COMBINING_DIACRITICS_RE, '')
    .replace(/[^\w\s-]/g, '')
    .trim();
}

/**
 * Monta o nome do arquivo no Google Drive. Usa só o PRIMEIRO nome do aluno
 * (não o nome completo, nem dados clínicos/familiares) — suficiente para a
 * professora reconhecer de quem é o documento entre vários, minimizando o
 * dado pessoal exposto no título de um arquivo que passa a existir fora do
 * IncluiAI, numa conta Google de terceiro.
 */
export function buildGoogleDocsDisplayName(
  docTypeLabel: string,
  studentFullName: string,
  auditCode?: string | null,
): string {
  const firstName = studentFullName.trim().split(/\s+/)[0] || 'Aluno';
  const parts = [sanitizeGoogleDocsDisplayNamePart(docTypeLabel), sanitizeGoogleDocsDisplayNamePart(firstName)];
  if (auditCode) parts.push(sanitizeGoogleDocsDisplayNamePart(auditCode));
  return parts.filter(Boolean).join(' - ') || 'Documento IncluiAI';
}

// ─── Upload multipart (Drive API v3) ─────────────────────────────────────────

export interface GoogleDocsUploadResult {
  fileId: string;
  url: string;
}

/**
 * Monta o corpo multipart/related exigido pelo upload multipart da Drive API
 * (metadados JSON + conteúdo binário do arquivo, com boundary próprio).
 * Função pura o suficiente para ser testada com um `Blob` real (disponível
 * globalmente também no Node — não depende de navegador).
 */
export function buildMultipartUploadRequestBody(
  metadata: Record<string, unknown>,
  fileBlob: Blob,
  fileMimeType: string,
): { body: Blob; contentType: string } {
  const boundary = `incluiai-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const metadataPart =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: ${fileMimeType}\r\n\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const body = new Blob([metadataPart, fileBlob, closeDelimiter], {
    type: `multipart/related; boundary=${boundary}`,
  });
  return { body, contentType: `multipart/related; boundary=${boundary}` };
}

const DRIVE_UPLOAD_ENDPOINT =
  'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink';

/** Tempo máximo de espera pelo upload antes de reportar "resultado desconhecido" (nunca repete o envio sozinho). */
const UPLOAD_TIMEOUT_MS = 45_000;

/**
 * Envia o DOCX para a Drive API, convertendo-o em Google Docs nativo via
 * `mimeType` de destino nos metadados (`application/vnd.google-apps.document`)
 * — o conteúdo enviado usa o MIME real do DOCX. Nunca inclui o token na URL
 * (vai só no header `Authorization`). Em timeout, lança um erro distinto
 * (`UPLOAD_TIMEOUT_UNKNOWN`) que o chamador deve tratar como "não sabemos se
 * foi criado" — nunca reenviar automaticamente.
 */
export async function uploadDocxAsGoogleDoc(params: {
  accessToken: string;
  fileBlob: Blob;
  displayName: string;
}): Promise<GoogleDocsUploadResult> {
  const { accessToken, fileBlob, displayName } = params;
  const metadata = { name: displayName, mimeType: GOOGLE_DOC_MIME_TYPE };
  const { body, contentType } = buildMultipartUploadRequestBody(metadata, fileBlob, DOCX_MIME_TYPE);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(DRIVE_UPLOAD_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': contentType,
      },
      body,
      signal: controller.signal,
    });
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new GoogleDriveExportError(
        'UPLOAD_TIMEOUT_UNKNOWN',
        'O envio demorou mais do que o esperado e não é possível confirmar se o documento foi criado. Confira no seu Google Drive antes de tentar de novo — esta ação não reenvia automaticamente, para não criar uma cópia duplicada.',
      );
    }
    throw new GoogleDriveExportError(
      'UPLOAD_FAILED',
      'Não foi possível enviar o documento para o Google Drive. Verifique sua conexão e tente novamente.',
    );
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    if (response.status === 401) {
      throw new GoogleDriveExportError(
        'TOKEN_REQUEST_FAILED',
        'Sua autorização com o Google expirou. Tente novamente.',
      );
    }
    throw new GoogleDriveExportError(
      'UPLOAD_FAILED',
      `Não foi possível criar o documento no Google Drive (código ${response.status}).`,
    );
  }

  const data = await response.json().catch(() => null);
  const fileId = data?.id;
  if (!fileId || typeof fileId !== 'string') {
    throw new GoogleDriveExportError(
      'UPLOAD_FAILED',
      'O Google Drive não retornou um identificador válido para o documento criado.',
    );
  }
  const url: string = typeof data?.webViewLink === 'string'
    ? data.webViewLink
    : `https://docs.google.com/document/d/${fileId}/edit`;
  return { fileId, url };
}

// ─── Orquestração de uma exportação completa ─────────────────────────────────

export type GoogleDocsExportStep = 'connecting' | 'preparing' | 'uploading';

export interface RunGoogleDocsExportParams {
  /** Gera o Blob do DOCX a exportar — tipicamente `() => exportDocumentToWord({...})`, o MESMO gerador usado por "Baixar Word". Injetado (não importado direto) para manter este serviço testável sem depender de `wordExportService.ts`/tipos de documento. */
  generateDocxBlob: () => Promise<Blob>;
  /** Nome de exibição já resolvido (ver `buildGoogleDocsDisplayName`). */
  displayName: string;
}

/**
 * Orquestra uma exportação completa: autoriza (se preciso) → gera o DOCX →
 * envia/convertendo para Google Docs nativo. Função pura o suficiente para
 * ser testada isoladamente da UI (React) — `DocumentBuilder.tsx` só chama
 * isto e traduz `onStepChange`/erros em estado de tela; nenhuma lógica de
 * autorização/upload/erro vive no componente.
 */
export async function exportCurrentDocumentToGoogleDocs(
  params: RunGoogleDocsExportParams,
  onStepChange?: (step: GoogleDocsExportStep) => void,
): Promise<GoogleDocsUploadResult> {
  onStepChange?.('connecting');
  await loadGoogleIdentityServices();
  const accessToken = await getValidGoogleDriveAccessToken();

  onStepChange?.('preparing');
  let blob: Blob;
  try {
    blob = await params.generateDocxBlob();
  } catch (e: any) {
    throw new GoogleDriveExportError(
      'DOCX_GENERATION_FAILED',
      e?.message || 'Não foi possível preparar o documento para envio.',
    );
  }

  onStepChange?.('uploading');
  return uploadDocxAsGoogleDoc({ accessToken, fileBlob: blob, displayName: params.displayName });
}

// ─── Abertura do documento (nova aba, sem acesso à janela de origem) ─────────

/**
 * Abre o link em nova aba, retornando `true`/`false` conforme a abertura foi
 * (aparentemente) bem-sucedida ou não — o chamador usa isso só para decidir
 * se mostra um link alternativo, nunca para afirmar categoricamente que o
 * navegador "bloqueou" o popup (ver comentário abaixo sobre por que isso não
 * pode ser afirmado com certeza).
 *
 * IMPORTANTE — por que NÃO passamos "noopener"/"noreferrer" como window
 * FEATURES aqui (achado da investigação de 28/08/2026, "Documento criado —
 * Abrir" aparecendo junto de "não foi possível abrir automaticamente" mesmo
 * quando a aba abria de verdade):
 *
 * Por especificação (https://html.spec.whatwg.org/multipage/window-object.html#window-open-steps,
 * refletido em https://developer.mozilla.org/docs/Web/API/Window/open —
 * seção "Window features" / `noopener`), quando o recurso "noopener" (ou
 * "noreferrer", que implica noopener) é usado na chamada de `window.open()`,
 * o valor de retorno é sempre `null` — MESMO quando a aba abriu com sucesso.
 * Ou seja, `win != null` não é um teste válido de "abriu ou não" quando esses
 * recursos estão na string de features passada a `window.open()`. Era
 * exatamente isso que fazia o aviso de bloqueio aparecer sempre, mesmo com a
 * aba abrindo — não havia evidência real de bloqueio, só uma leitura
 * incorreta de um retorno `null` que é esperado/normal nesse caso.
 *
 * A proteção real que importa aqui é impedir que a nova aba tenha acesso a
 * `window.opener` (para não conseguir navegar/redirecionar a aba do IncluiAI
 * — "reverse tabnabbing"). Isso é preservado da MESMA forma, mas manualmente:
 * anulamos `win.opener` na referência retornada, técnica padrão e mais antiga
 * que o recurso "noopener" (documentada, entre outros, em
 * https://developer.mozilla.org/docs/Web/API/Window/open e em guias de
 * segurança sobre "target=_blank" — ex. https://web.dev/external-anchors-use-rel-noopener/).
 * Isso preserva a mesma garantia de segurança e devolve um retorno de
 * `window.open()` que reflete de verdade se a aba abriu.
 *
 * O referrer (cabeçalho HTTP enviado ao Google ao abrir o link) deixa de ser
 * suprimido — troca consciente, não um descuido: o único dado exposto nesse
 * cabeçalho é a própria origem do IncluiAI (nunca um token — este serviço
 * nunca põe token em URL), o que não representa risco de segurança relevante
 * para este caso de uso específico.
 */
export function openGoogleDocLink(url: string): boolean {
  const w = (globalThis as any).window;
  if (!w?.open) return false;
  const win = w.open(url, '_blank');
  if (!win) return false;
  try {
    win.opener = null;
  } catch {
    // Cross-origin (a aba já navegou para docs.google.com): a política de
    // mesma origem já impede qualquer acesso nosso a ela de qualquer forma
    // — não há nada inseguro em silenciar esta exceção.
  }
  return true;
}
