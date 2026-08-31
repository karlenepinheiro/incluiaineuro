import type { ProfileSex } from '../types';

/**
 * Resolução da personagem ilustrada usada nos heros do IncluiAI (Dashboard,
 * Meus Alunos, etc.).
 */

export const HERO_CHARACTER_ASSETS = {
  /** Personagem neutra — usada para 'nao_declarar' e para ausência de dado. */
  neutral: '/images/teacher-neutral.png',
  /** Personagem feminina — professora. */
  female:  '/images/teacher-female.png',
  /** Personagem masculina — professor. */
  male:    '/images/teacher-male.png',
} as const;

export type HeroCharacterVariant = keyof typeof HERO_CHARACTER_ASSETS;

export type ProfessorSexo = ProfileSex;

export function normalizeProfileSex(sex?: ProfileSex | string | null): ProfileSex {
  if (sex === 'female' || sex === 'feminino') return 'female';
  if (sex === 'male' || sex === 'masculino') return 'male';
  return 'unspecified';
}

export function resolveHeroCharacterVariant(sex?: ProfileSex | string | null): HeroCharacterVariant {
  const normalized = normalizeProfileSex(sex);
  if (normalized === 'female') return 'female';
  if (normalized === 'male') return 'male';
  return 'neutral';
}

/**
 * Resolve qual variante da personagem exibir a partir do sexo do
 * assinante/professor.
 *
 *   female      -> professora
 *   male        -> professor
 *   unspecified -> neutra
 *   undefined/null/qualquer outro valor → neutra (fallback seguro)
 */
export function resolveHeroCharacterAsset(sex?: ProfileSex | string | null): string {
  return HERO_CHARACTER_ASSETS[resolveHeroCharacterVariant(sex)];
}
