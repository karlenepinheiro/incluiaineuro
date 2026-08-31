import { describe, expect, it } from 'vitest';
import {
  DOCX_MIME_TYPE,
  GOOGLE_DOC_MIME_TYPE,
  GOOGLE_DOCS_EXPORT_ENABLED,
  GOOGLE_DRIVE_FILE_SCOPE,
  GOOGLE_OAUTH_CLIENT_ID,
  resolveGoogleDocsExportEnabled,
  resolveGoogleOAuthClientId,
} from '../googleDriveConfig';

describe('resolveGoogleOAuthClientId — configuração ausente nunca é confundida com configurada', () => {
  it('retorna null quando a variável não está definida', () => {
    expect(resolveGoogleOAuthClientId(undefined)).toBeNull();
  });

  it('retorna null para string vazia ou só espaços', () => {
    expect(resolveGoogleOAuthClientId('')).toBeNull();
    expect(resolveGoogleOAuthClientId('   ')).toBeNull();
  });

  it('retorna null para um placeholder esquecido (não parece um Client ID real)', () => {
    expect(resolveGoogleOAuthClientId('SEU_CLIENT_ID_AQUI')).toBeNull();
    expect(resolveGoogleOAuthClientId('changeme')).toBeNull();
  });

  it('aceita um Client ID com o formato real do Google (termina em .apps.googleusercontent.com)', () => {
    expect(resolveGoogleOAuthClientId('123456-abc.apps.googleusercontent.com')).toBe(
      '123456-abc.apps.googleusercontent.com',
    );
  });

  it('remove espaços nas bordas antes de validar', () => {
    expect(resolveGoogleOAuthClientId('  123.apps.googleusercontent.com  ')).toBe(
      '123.apps.googleusercontent.com',
    );
  });
});

describe('resolveGoogleDocsExportEnabled — fail-safe sem configuração', () => {
  it('desabilitada quando o Client ID é null', () => {
    expect(resolveGoogleDocsExportEnabled(null)).toBe(false);
  });

  it('habilitada quando há um Client ID resolvido', () => {
    expect(resolveGoogleDocsExportEnabled('123.apps.googleusercontent.com')).toBe(true);
  });
});

describe('constantes exportadas — tipos e valores estáveis', () => {
  it('GOOGLE_OAUTH_CLIENT_ID e GOOGLE_DOCS_EXPORT_ENABLED são consistentes entre si (independente do .env de quem roda o teste)', () => {
    expect(typeof GOOGLE_DOCS_EXPORT_ENABLED).toBe('boolean');
    expect(GOOGLE_DOCS_EXPORT_ENABLED).toBe(GOOGLE_OAUTH_CLIENT_ID !== null);
  });

  it('escopo mínimo é exatamente drive.file — nunca o Drive completo', () => {
    expect(GOOGLE_DRIVE_FILE_SCOPE).toBe('https://www.googleapis.com/auth/drive.file');
  });

  it('MIME de origem (DOCX) e de destino (Google Docs) estão corretos e são distintos', () => {
    expect(DOCX_MIME_TYPE).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    expect(GOOGLE_DOC_MIME_TYPE).toBe('application/vnd.google-apps.document');
    expect(DOCX_MIME_TYPE).not.toBe(GOOGLE_DOC_MIME_TYPE);
  });
});
