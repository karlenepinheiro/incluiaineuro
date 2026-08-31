/**
 * Cenário "configuração ausente" isolado num arquivo próprio: mocka
 * `googleDriveConfig` com `GOOGLE_OAUTH_CLIENT_ID: null` ANTES de importar o
 * serviço, para garantir determinismo independente do `.env` de quem executa
 * os testes (o registro de módulos do vitest é isolado por arquivo — por
 * isso este cenário fica separado de `googleDriveExportService.test.ts`, que
 * mocka um Client ID válido para os demais cenários).
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../config/googleDriveConfig', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../config/googleDriveConfig')>();
  return { ...actual, GOOGLE_OAUTH_CLIENT_ID: null };
});

import { GoogleDriveExportError, requestGoogleDriveAccessToken } from '../googleDriveExportService';

describe('requestGoogleDriveAccessToken — configuração ausente', () => {
  it('rejeita com NOT_CONFIGURED sem tentar tocar em window/google', async () => {
    const err: any = await requestGoogleDriveAccessToken().catch((e) => e);
    expect(err).toBeInstanceOf(GoogleDriveExportError);
    expect(err.code).toBe('NOT_CONFIGURED');
  });
});
