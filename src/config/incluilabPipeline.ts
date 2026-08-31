// src/config/incluilabPipeline.ts
//
// Feature flag do MOTOR do IncluiLAB — separada, de propósito, da flag de UI
// (INCLUILAB_NEW_UI, em src/config/incluilabUi.ts). UI e motor evoluem de
// forma independente: trocar a interface não liga o pipeline novo, e ligar
// o pipeline novo não depende de qual interface está ativa.
//
// ─────────────────────────────────────────────────────────────────────────
// PIPELINE CANÔNICO (Sprint 2B) — Activity Pipeline (atividade | avaliacao | adaptacao)
//
// Controla se os modos "A4 Econômica" e "Adaptar — Texto" usam o novo
// pipeline (CanonicalGenerationRequest → Intent Extractor → validação
// estrita → ActivityPackage) em vez do fluxo legado (geração direta +
// fallback de guia).
//
// Nasce DESLIGADO por padrão. O pipeline legado permanece 100% intacto e
// acessível como fallback — esta flag não remove nem substitui nada.
//
// COMO ATIVAR (apenas para teste manual autorizado):
//   1. Troque o valor abaixo para `true`.
//   2. Salve o arquivo.
//   3. Os modos "A4 Econômica" e "Adaptar — Texto" passam a usar o Activity
//      Pipeline canônico (reserva de créditos → geração → validação →
//      reparo único se necessário → commit ou liberação da reserva).
//
// COMO VOLTAR:
//   1. Troque o valor de volta para `false`.
//   2. Salve. Os dois modos voltam a usar o fluxo legado imediatamente.
// ─────────────────────────────────────────────────────────────────────────
export const INCLUILAB_CANONICAL_PIPELINE = false;

export type IncluiLabCanonicalMode =
  | 'a4_economica'
  | 'avaliacao'
  | 'adaptar_economico'
  | 'a4_visual'
  | 'a4_premium'
  | 'adaptar_visual'
  | 'adaptar_premium';

export const INCLUILAB_CANONICAL_PIPELINE_BY_MODE: Record<IncluiLabCanonicalMode, boolean> = {
  a4_economica: true,
  avaliacao: true,
  adaptar_economico: true,
  a4_visual: false,
  a4_premium: false,
  adaptar_visual: false,
  adaptar_premium: false,
};

export function isIncluiLabCanonicalModeEnabled(mode: IncluiLabCanonicalMode): boolean {
  return INCLUILAB_CANONICAL_PIPELINE || INCLUILAB_CANONICAL_PIPELINE_BY_MODE[mode] === true;
}
