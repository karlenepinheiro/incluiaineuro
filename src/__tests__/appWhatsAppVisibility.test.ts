import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const appPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../App.tsx');
const source = readFileSync(appPath, 'utf-8');

describe('App — WhatsApp flutuante somente no Dashboard principal', () => {
  it('renderiza o botão flutuante autenticado apenas quando view === dashboard', () => {
    expect(source).toContain("{view === 'dashboard' && <WhatsAppFloatButton />}");
    expect(source).not.toContain('{view === \'incluilab\' && <WhatsAppFloatButton />}');
    expect(source).not.toContain('{view === \'incluilab_library\' && <WhatsAppFloatButton />}');
    expect(source).not.toContain('{view === \'settings\' && <WhatsAppFloatButton />}');
  });
});
