import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Testes de regressão baseados em leitura do código-fonte (mesmo padrão já usado
// em databaseServiceProfileSex.test.ts) — o projeto não usa jsdom/Testing
// Library, então não é possível renderizar o componente nesta suíte.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const sidebarSource = fs.readFileSync(path.join(root, 'src/components/Sidebar.tsx'), 'utf8');

describe('Simplificação do rodapé da sidebar', () => {
  it('remove o bloco de identificação do usuário (avatar/nome/cargo) do rodapé', () => {
    // profileDisplay/getSidebarProfileDisplay não devem mais ser usados dentro
    // do componente — só os helpers exportados permanecem (cobertos por
    // SidebarProfile.test.ts), sem consumidor no JSX do rodapé.
    expect(sidebarSource).not.toContain('getSidebarProfileDisplay(user)');
    expect(sidebarSource).not.toContain('profileDisplay.name');
    expect(sidebarSource).not.toContain('profileDisplay.subtitle');
    expect(sidebarSource).not.toContain('profileDisplay.photoUrl');
  });

  it('renomeia "Suporte Humanizado" para "Suporte", preservando ícone/link/ação', () => {
    expect(sidebarSource).not.toContain('Suporte Humanizado');
    expect(sidebarSource).toContain('>Suporte<');
    // Mesma ação/rota: link do WhatsApp, ícone e badge "WA" inalterados.
    expect(sidebarSource).toContain("waUrl('Olá! Vim pelo IncluiAI e gostaria de ajuda.')");
    expect(sidebarSource).toContain('<MessageCircle size={18}');
    expect(sidebarSource).toMatch(/bg-green-100 text-green-700 shrink-0">\s*WA\s*<\/span>/);
  });

  it('"Configurações" aparece como item de navegação normal, logo após "Suporte", e não duplicado', () => {
    const suporteIdx = sidebarSource.indexOf('>Suporte<');
    const settingsNavIdx = sidebarSource.indexOf('viewId="settings"');
    expect(suporteIdx).toBeGreaterThan(-1);
    expect(settingsNavIdx).toBeGreaterThan(-1);
    expect(settingsNavIdx).toBeGreaterThan(suporteIdx);

    // Não duplicado: só uma ocorrência de viewId="settings" no arquivo inteiro.
    const occurrences = sidebarSource.split('viewId="settings"').length - 1;
    expect(occurrences).toBe(1);

    // Usa o mesmo componente NavItem dos demais itens (não é mais um bloco
    // avulso no rodapé com estilos próprios).
    expect(sidebarSource).toContain('<NavItem viewId="settings" icon={Settings} label="Configurações"');
  });

  it('o botão "Sair" é compacto, usa o mesmo padrão de altura/ícone dos NavItem e preserva onLogout', () => {
    expect(sidebarSource).toContain('onClick={onLogout}');
    expect(sidebarSource).toContain('aria-label="Sair da conta"');
    expect(sidebarSource).toContain('>Sair<');
    expect(sidebarSource).not.toContain('Sair da Conta');
    // Mesma altura/paddings dos demais itens de navegação (px-3 py-2.5), sem
    // caixa vermelha ocupando toda a largura (sem bg-red-50 permanente — só
    // no hover) e some para ícone-apenas quando recolhida.
    expect(sidebarSource).toContain('<LogOut size={18} className="shrink-0" />');
  });

  it('não introduz uma nova área de rolagem no rodapé nem duplica "Configurações"', () => {
    const footerBlock = sidebarSource.slice(sidebarSource.indexOf('{/* Rodapé fixo'));
    expect(footerBlock).not.toContain('overflow-y-auto');
    expect(footerBlock).not.toContain('overflow-scroll');
    expect(footerBlock).not.toContain('viewId="settings"');
  });
});
