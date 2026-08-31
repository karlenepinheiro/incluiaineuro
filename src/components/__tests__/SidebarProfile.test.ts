import { describe, expect, it } from 'vitest';
import { getSidebarProfileDisplay, getUserInitials, shouldShowSidebarProfileText } from '../Sidebar';

describe('Sidebar profile display', () => {
  it('com foto retorna a mesma foto do perfil', () => {
    const display = getSidebarProfileDisplay({
      name: 'Karlene Sousa Pinheiro',
      email: 'karlene@example.com',
      cargo: 'Professora',
      profilePhoto: 'data:image/png;base64,abc',
    });
    expect(display.photoUrl).toBe('data:image/png;base64,abc');
    expect(display.name).toBe('Karlene Sousa Pinheiro');
    expect(display.subtitle).toBe('Professora');
  });

  it('sem foto usa iniciais como fallback', () => {
    expect(getUserInitials('Karlene Sousa Pinheiro')).toBe('KP');
    expect(getSidebarProfileDisplay({
      name: 'Karlene Sousa Pinheiro',
      email: 'karlene@example.com',
      cargo: '',
      profilePhoto: '',
    })).toMatchObject({
      photoUrl: null,
      initials: 'KP',
      subtitle: 'Professor(a)',
    });
  });

  it('expandida mostra texto; recolhida mostra apenas avatar/foto', () => {
    expect(shouldShowSidebarProfileText(false)).toBe(true);
    expect(shouldShowSidebarProfileText(true)).toBe(false);
  });
});
