// config/googleDriveConfig.ts
// ─────────────────────────────────────────────────────────────────────────────
// Configuração da integração "Abrir no Google Docs" (piloto PAEE, 27/08/2026).
//
// ESCOPO: só resolve/expõe configuração pública (Client ID OAuth) e o predicado
// que decide se o botão pode aparecer. NÃO contém segredo nenhum — o Client ID
// OAuth de uma aplicação Web é, por definição do próprio Google, uma
// configuração pública (não é um "client secret"; ver
// https://developers.google.com/identity/oauth2/web/guides/use-token-model).
// O client secret NUNCA deve existir neste projeto — o fluxo escolhido (Google
// Identity Services, "token model") não usa client secret nenhum.
//
// COMO HABILITAR (ambiente local):
//   1. Adicione ao seu .env ou .env.local:
//        VITE_GOOGLE_OAUTH_CLIENT_ID=SEU_CLIENT_ID.apps.googleusercontent.com
//   2. Reinicie o servidor de desenvolvimento (Vite só lê VITE_* na
//      inicialização do processo).
//   Ver o checklist completo de configuração externa no relatório desta fase.
//
// COMO DESABILITAR (padrão de fábrica):
//   Não defina a variável (ou deixe vazia/com um valor que não pareça um
//   Client ID real). Sem uma configuração que pareça válida, o botão "Abrir no
//   Google Docs" NÃO aparece — fail-safe: nunca expor uma ação aparentemente
//   funcional sem a configuração real por trás dela.
//
// Não depende de banco de dados, Supabase, migrations ou RLS — resolvido
// inteiramente em runtime do frontend, como DOCUMENT_WORKSPACE_ENABLED em
// documentWorkspaceFlags.ts.

/** Escopo mínimo solicitado — acesso somente aos arquivos criados pelo próprio IncluiAI, nunca ao Drive inteiro da professora. */
export const GOOGLE_DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

/** MIME type do arquivo DOCX enviado (conteúdo real do upload). */
export const DOCX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** MIME type de destino — instrui o Drive a converter o DOCX em Google Docs nativo. */
export const GOOGLE_DOC_MIME_TYPE = 'application/vnd.google-apps.document';

/**
 * Valida o formato do Client ID sem validar se ele é realmente válido junto ao
 * Google (isso só a própria chamada de autorização pode confirmar). Client IDs
 * OAuth de Web do Google sempre terminam em ".apps.googleusercontent.com" —
 * uma string vazia, um placeholder esquecido (ex.: "SEU_CLIENT_ID_AQUI") ou
 * qualquer valor que não siga esse formato é tratado como "não configurado",
 * nunca como uma tentativa real de autorização.
 */
export function resolveGoogleOAuthClientId(raw: string | undefined): string | null {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return null;
  if (!trimmed.endsWith('.apps.googleusercontent.com')) return null;
  return trimmed;
}

const rawClientId = (import.meta as any).env?.VITE_GOOGLE_OAUTH_CLIENT_ID as string | undefined;

/** Client ID OAuth (configuração pública) — `null` quando ausente/mal-formado. */
export const GOOGLE_OAUTH_CLIENT_ID = resolveGoogleOAuthClientId(rawClientId);

/**
 * Predicado puro (testável sem `import.meta.env`) que decide se a integração
 * "Abrir no Google Docs" deve aparecer. Hoje depende só do Client ID estar
 * configurado — sem uma flag mestre separada, para não exigir duas variáveis
 * para a mesma decisão (diferente de DOCUMENT_WORKSPACE_ENABLED, que controla
 * um workspace inteiro independente de configuração externa).
 */
export function resolveGoogleDocsExportEnabled(clientId: string | null): boolean {
  return clientId !== null;
}

/** Flag efetiva desta fase — `true` somente com um Client ID configurado e com formato válido. */
export const GOOGLE_DOCS_EXPORT_ENABLED = resolveGoogleDocsExportEnabled(GOOGLE_OAUTH_CLIENT_ID);
