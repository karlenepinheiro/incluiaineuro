import { describe, expect, it } from 'vitest';
import {
  HERO_CHARACTER_ASSETS,
  normalizeProfileSex,
  resolveHeroCharacterAsset,
  resolveHeroCharacterVariant,
} from '../heroCharacterAssets';

describe('resolveHeroCharacterAsset', () => {
  it('female resolve para asset feminino', () => {
    expect(resolveHeroCharacterVariant('female')).toBe('female');
    expect(resolveHeroCharacterAsset('female')).toBe(HERO_CHARACTER_ASSETS.female);
  });

  it('male resolve para asset masculino', () => {
    expect(resolveHeroCharacterVariant('male')).toBe('male');
    expect(resolveHeroCharacterAsset('male')).toBe(HERO_CHARACTER_ASSETS.male);
  });

  it('unspecified resolve para default/neutro', () => {
    expect(resolveHeroCharacterVariant('unspecified')).toBe('neutral');
    expect(resolveHeroCharacterAsset('unspecified')).toBe(HERO_CHARACTER_ASSETS.neutral);
  });

  it('undefined/null/desconhecido resolve para default/neutro', () => {
    expect(resolveHeroCharacterAsset(undefined)).toBe(HERO_CHARACTER_ASSETS.neutral);
    expect(resolveHeroCharacterAsset(null)).toBe(HERO_CHARACTER_ASSETS.neutral);
    expect(resolveHeroCharacterAsset('')).toBe(HERO_CHARACTER_ASSETS.neutral);
  });

  it('mantem compatibilidade com valores legados sem inferir por nome', () => {
    expect(normalizeProfileSex('feminino')).toBe('female');
    expect(normalizeProfileSex('masculino')).toBe('male');
    expect(normalizeProfileSex('Karlene')).toBe('unspecified');
  });
});
