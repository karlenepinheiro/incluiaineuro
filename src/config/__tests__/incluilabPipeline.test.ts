import { describe, expect, it } from 'vitest';
import {
  INCLUILAB_CANONICAL_PIPELINE,
  INCLUILAB_CANONICAL_PIPELINE_BY_MODE,
  isIncluiLabCanonicalModeEnabled,
} from '../incluilabPipeline';

describe('flag do motor (Activity Pipeline canônico) — Checkpoint 2B.1', () => {
  it('INCLUILAB_CANONICAL_PIPELINE nasce desligada por padrão', () => {
    expect(INCLUILAB_CANONICAL_PIPELINE).toBe(false);
  });

  it('vive em src/config/incluilabPipeline.ts, separada da flag de UI', () => {
    // Regressão de arquitetura: a separação UI x motor pedida no Checkpoint 2B.1
    // depende de este arquivo existir e exportar a flag — se alguém mover a
    // flag de volta para incluilabUi.ts, este import passa a falhar em tempo
    // de build/teste antes de qualquer teste manual.
    expect(INCLUILAB_CANONICAL_PIPELINE).toBe(false);
  });

  it('ativa o canônico de forma segmentada só para modos seguros neste sprint', () => {
    expect(INCLUILAB_CANONICAL_PIPELINE_BY_MODE.a4_economica).toBe(true);
    expect(INCLUILAB_CANONICAL_PIPELINE_BY_MODE.avaliacao).toBe(true);
    expect(INCLUILAB_CANONICAL_PIPELINE_BY_MODE.adaptar_economico).toBe(true);
    expect(INCLUILAB_CANONICAL_PIPELINE_BY_MODE.a4_visual).toBe(false);
    expect(INCLUILAB_CANONICAL_PIPELINE_BY_MODE.a4_premium).toBe(false);
  });

  it('isIncluiLabCanonicalModeEnabled respeita a flag por modo mesmo com a global desligada', () => {
    expect(isIncluiLabCanonicalModeEnabled('avaliacao')).toBe(true);
    expect(isIncluiLabCanonicalModeEnabled('a4_visual')).toBe(false);
  });
});
