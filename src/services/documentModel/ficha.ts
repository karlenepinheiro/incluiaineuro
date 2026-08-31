// services/documentModel/ficha.ts
// ─────────────────────────────────────────────────────────────────────────────
// [FASE 2] Adaptador para a família "Fichas Complementares" de
// FichasComplementaresView.tsx: Observação do Professor Regente, Escuta da
// Família, Análise do AEE, Decisão Institucional, Acompanhamento/Evolução.
//
// Todas compartilham o mesmo formato (FichaTemplate.fields + valores digitados),
// então um único adaptador cobre a família inteira — igual ao PDF canônico
// (PDFGenerator.generateFicha), que também é genérico sobre `fields`.

import type { DocSection } from '../../types';
import {
  buildSections,
  proseField,
  resetFieldSeq,
  scaleField,
  section,
} from './sectionBuilders';

export interface FichaExportField {
  label: string;
  value: string;
  /** `true` para os campos `type: 'scale'` do template. */
  isScale?: boolean;
}

/**
 * Converte os campos preenchidos de uma ficha em uma única seção "Campos de
 * Observação" — mesma seção II do PDF canônico. Campos de escala viram barra
 * 1..5; os demais viram texto corrido rotulado. Vazios → "Não informado".
 */
export function fichaToSections(fichaTitle: string, fields: FichaExportField[]): DocSection[] {
  resetFieldSeq();
  const secId = 'campos';
  const built = fields.flatMap(f =>
    f.isScale
      ? scaleField(secId, f.label, f.value, 5)
      : proseField(secId, f.label, f.value),
  );
  return buildSections([
    section(`Campos de Observação — ${fichaTitle}`.trim(), built),
  ]);
}
