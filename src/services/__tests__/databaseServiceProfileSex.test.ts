import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const databaseSource = fs.readFileSync(path.join(root, 'src/services/databaseService.ts'), 'utf8');
const settingsSource = fs.readFileSync(path.join(root, 'src/views/SettingsView.tsx'), 'utf8');
const appSource = fs.readFileSync(path.join(root, 'src/App.tsx'), 'utf8');
const sidebarSource = fs.readFileSync(path.join(root, 'src/components/Sidebar.tsx'), 'utf8');

describe('perfil do assinante — sexo', () => {
  it('carrega sex do perfil quando a coluna existe', () => {
    expect(databaseSource).toContain('cargo, sex, profile_photo_url');
    expect(databaseSource).toContain('sex:                    normalizeProfileSex((userRow as any).sex)');
  });

  it('ausencia da coluna sex nao quebra login/leitura de perfil', () => {
    expect(databaseSource).toContain('isMissingSexColumnError');
    expect(databaseSource).toContain(".replace('sex, ', '')");
  });

  it('altera sex pelo formulario de Dados Pessoais e mantem no usuario em memoria', () => {
    expect(settingsSource).toContain("const [sex, setSex] = useState<ProfileSex>(user.sex ?? 'unspecified')");
    expect(settingsSource).toContain('sex,');
    expect(settingsSource).toContain('setSex(e.target.value as ProfileSex)');
  });

  it('propaga sex do perfil para os heros sem fetch proprio no Hero', () => {
    expect(appSource).toContain('professorSexo={user.sex}');
    expect(databaseSource).not.toContain("from('students').select('sex')");
  });
});

describe('regressao sidebar', () => {
  // [Simplificação do menu lateral] Configurações deixou de ser um bloco
  // isolado no rodapé e passou a ser um item de navegação normal (ainda com
  // viewId="settings"); o rótulo do botão de sair foi encurtado de
  // "Sair da Conta" para "Sair" (mantendo a mesma ação de logout).
  it('mantem Configuracoes como item de navegacao e a acao de logout', () => {
    expect(sidebarSource).toContain('viewId="settings"');
    expect(sidebarSource).toContain('onClick={onLogout}');
  });

  it('botao de sair usa o rotulo compacto "Sair" (nao mais "Sair da Conta")', () => {
    expect(sidebarSource).toContain('>Sair<');
    expect(sidebarSource).not.toContain('Sair da Conta');
  });
});
