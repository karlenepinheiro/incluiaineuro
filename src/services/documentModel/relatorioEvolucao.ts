// services/documentModel/relatorioEvolucao.ts
// ─────────────────────────────────────────────────────────────────────────────
// [FASE 2] Adaptador do "Relatório Evolutivo" (ReportsView):
// avaliação multidimensional por critério (escala 1–5) + parecer descritivo +
// campos complementares + histórico de avaliações.
//
// Os gráficos do PDF (radar/barras/linha) são representações VISUAIS dos mesmos
// números — no Word os dados vão como tabela (fiel ao conteúdo, §5).

import type { DocField, DocSection } from '../../types';
import {
  buildSections,
  gridField,
  proseField,
  resetFieldSeq,
  scaleField,
  section,
} from './sectionBuilders';

export interface EvolucaoAdapterInput {
  scores: number[];
  observation: string;
  criteria: Array<{ name: string; desc?: string }>;
  customFields?: DocField[];
  /** Histórico: cada item { date, scores } (StudentEvolution). */
  history?: Array<{ date?: string; createdAt?: string; scores?: number[] }>;
}

export function relatorioEvolucaoTitle(): string {
  return 'Relatório Evolutivo — Acompanhamento de Desenvolvimento';
}

export function relatorioEvolucaoToSections(input: EvolucaoAdapterInput): DocSection[] {
  resetFieldSeq();
  const { scores, observation, criteria, customFields = [], history = [] } = input;

  const scoreRows = criteria.map((c, i) => [
    c.name,
    scores[i] != null ? `${scores[i]}/5` : '—',
    c.desc ?? '',
  ]);
  const media = scores.length
    ? (scores.reduce((a, b) => a + (Number(b) || 0), 0) / scores.length).toFixed(1)
    : null;

  const histRows = history
    .map(h => {
      const d = h.date || h.createdAt || '';
      const avg = h.scores?.length
        ? (h.scores.reduce((a, b) => a + (Number(b) || 0), 0) / h.scores.length).toFixed(1)
        : '';
      return [d ? new Date(d).toLocaleDateString('pt-BR') : '—', avg ? `${avg}/5` : '—'];
    })
    .filter(r => r[0] !== '—' || r[1] !== '—');

  const customBuilt = customFields.flatMap(f =>
    f.type === 'scale'
      ? scaleField('custom', f.label, f.value, f.maxScale || 5)
      : proseField('custom', f.label, f.value, { optional: true }),
  );

  return buildSections([
    section('Avaliação Multidimensional (Escala 1–5)', [
      gridField('escala', '', ['Critério', 'Nota', 'Descrição'], scoreRows),
      ...(media
        ? [{ id: 'media', label: 'Média geral', type: 'text' as const, value: `${media}/5` }]
        : []),
    ]),

    section('Parecer Descritivo', [
      proseField('parecer', '', observation),
    ]),

    customBuilt.length > 0 && section('Campos Complementares', customBuilt),

    histRows.length > 1 && section('Histórico de Avaliações', [
      gridField('hist', '', ['Data', 'Média'], histRows),
    ]),
  ]);
}
