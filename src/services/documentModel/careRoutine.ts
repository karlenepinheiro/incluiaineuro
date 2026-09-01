// services/documentModel/careRoutine.ts
// [FASE 2 · BLOCO B] Adaptador: Rotina da Cuidadora (CareSection[]) → DocSection[].
//
// Hoje a "Cuidadoras e Rotina" (CareRoutineTab) NÃO tem nenhuma exportação —
// este adaptador dá origem ao PDF e ao Word (via generateFromSections + Word
// genérico). Preserva ordem (order_index já vem ordenado do serviço), rótulos,
// valores e campos vazios ("Não informado").
//
// Tipos de campo (CareField.field_type): text | checklist | scale | suggestions
// | rubric | audio | ai_prompt.

import type { DocField, DocSection } from '../../types';
import type { CareField, CareSection } from '../careRoutineService';
import {
  buildSections, cleanText, gridField, proseField, resetFieldSeq, scaleField, section,
} from './sectionBuilders';

function fieldToDocFields(sectionId: string, f: CareField): DocField[] {
  const label = f.label || 'Campo';
  switch (f.field_type) {
    case 'checklist': {
      const items: string[] = f.options?.items ?? [];
      const checked: number[] = f.value?.checked ?? [];
      const marked = checked.map(i => items[i]).filter(Boolean);
      return marked.length
        ? [{ id: `${sectionId}_cl`, label, type: 'checklist', value: marked }]
        : proseField(sectionId, label, '');
    }
    case 'scale': {
      const max = f.options?.max ?? 5;
      const score = f.value?.score ?? null;
      return scaleField(sectionId, label, score, max);
    }
    case 'suggestions': {
      const chips: string[] = f.options?.chips ?? [];
      const selected: number[] = f.value?.selected ?? [];
      const picked = selected.map(i => chips[i]).filter(Boolean);
      const text = cleanText(f.value?.text);
      const out: DocField[] = [];
      if (picked.length) out.push({ id: `${sectionId}_sg`, label, type: 'checklist', value: picked });
      if (text) out.push(...proseField(sectionId, picked.length ? 'Observações complementares' : label, text));
      return out.length ? out : proseField(sectionId, label, '');
    }
    case 'rubric': {
      const criteria: string[] = f.options?.criteria ?? [];
      const levels: string[] = f.options?.levels ?? [];
      const vals: Record<string, string> = f.value ?? {};
      if (!criteria.length || !levels.length) return proseField(sectionId, label, '');
      const rows = criteria.map(cr => [cr, ...levels.map(lv => (vals[cr] === lv ? 'X' : ''))]);
      return gridField(sectionId, label, ['Critério', ...levels], rows);
    }
    default: // text | audio | ai_prompt
      return proseField(sectionId, label, f.value);
  }
}

export function careRoutineTitle(): string {
  return 'Rotina da Cuidadora e Plano de Cuidados';
}

export function careRoutineToSections(sections: CareSection[]): DocSection[] {
  resetFieldSeq();
  return buildSections(
    (sections ?? [])
      .slice()
      .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
      .map(sec => {
        const fields = (sec.fields ?? [])
          .slice()
          .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
          .flatMap(f => fieldToDocFields('cr', f));
        return section(sec.title || 'Seção', fields);
      }),
  );
}
