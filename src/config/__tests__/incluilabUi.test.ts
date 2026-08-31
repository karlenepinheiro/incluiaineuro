import { describe, expect, it } from 'vitest';
import { INCLUILAB_NEW_UI } from '../incluilabUi';

describe('flag de UI do IncluiLAB', () => {
  it('INCLUILAB_NEW_UI é um boolean (independente da flag do motor)', () => {
    expect(typeof INCLUILAB_NEW_UI).toBe('boolean');
  });
});
