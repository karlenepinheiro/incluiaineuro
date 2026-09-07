/**
 * Resolução da personagem ilustrada usada nos heros do IncluiAI (Dashboard etc.).
 *
 * [Porte visual do redesign 2.0 — sem dependência de cadastro/sexo]
 * O projeto ainda NÃO tem o campo `sex` no perfil do usuário. Este helper é
 * puramente visual: opera com um "hint" opcional (string) e, na ausência de
 * dado (o caso de hoje), sempre devolve a variante neutra — fallback seguro.
 * Nenhuma migration, tipo de `types.ts` ou tela de cadastro é necessária.
 * Se/quando a troca por gênero for ligada no futuro, basta passar o hint
 * ('female' | 'male' | 'feminino' | 'masculino') — a API não muda.
 */

export const HERO_CHARACTER_ASSETS = {
  /** Personagem neutra — usada por padrão e para ausência de dado. */
  neutral: '/images/teacher-neutral.png',
  /** Personagem feminina — professora. */
  female: '/images/teacher-female.png',
  /** Personagem masculina — professor. */
  male: '/images/teacher-male.png',
} as const;

export type HeroCharacterVariant = keyof typeof HERO_CHARACTER_ASSETS;

export function resolveHeroCharacterVariant(hint?: string | null): HeroCharacterVariant {
  const v = String(hint ?? '').trim().toLowerCase();
  if (v === 'female' || v === 'feminino') return 'female';
  if (v === 'male' || v === 'masculino') return 'male';
  return 'neutral';
}

/**
 * Resolve o caminho do asset da personagem do hero.
 *
 *   'female' | 'feminino'  -> professora
 *   'male'   | 'masculino' -> professor
 *   undefined/null/outro   -> neutra (fallback seguro — comportamento atual)
 */
export function resolveHeroCharacterAsset(hint?: string | null): string {
  return HERO_CHARACTER_ASSETS[resolveHeroCharacterVariant(hint)];
}
