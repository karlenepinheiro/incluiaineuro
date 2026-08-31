// services/documentModel/checklist.ts
// [FASE 2 · BLOCO B] Adaptadores dos checklists de observação → DocSection[].
//
// Classificação (ver relatório §7): AMBOS são DOCUMENTOS FINAIS exportáveis —
// têm tela própria com "Imprimir / PDF", salvam em observation_forms com
// audit_code e são entregues à equipe/família. Também alimentam a IA, mas o
// artefato exportável existe.
//
//   - Checklist do Professor Regente / Observação de Sala (ChecklistRegenteData)
//   - Checklist da Cuidadora (ChecklistCuidadoraData)
//
// O adaptador é genérico sobre a lista de seções (CheckSection[]) que cada
// formulário já exporta — a ordem é a mesma da tela e do PDF de impressão.

import type { DocSection } from '../../types';
import {
  buildSections, kvField, listField, proseField, resetFieldSeq, section,
} from './sectionBuilders';

export interface ChecklistSectionSpec {
  /** chave do array de itens marcados dentro do objeto de dados */
  id: string;
  label: string;
}

export interface ChecklistAdapterInput {
  title: string;
  data: Record<string, any>;
  /** Cabeçalho: pares [rótulo, chave] na ordem desejada. */
  headerFields: Array<[label: string, key: string]>;
  /** Seções de itens marcados, na ordem da tela (form.SECTIONS). */
  sections: ChecklistSectionSpec[];
  /** Chave de um campo de contexto (lista) exibido antes das seções — opcional. */
  contextKey?: string;
  contextLabel?: string;
}

export function checklistToSections(input: ChecklistAdapterInput): DocSection[] {
  resetFieldSeq();
  const { data, headerFields, sections, contextKey, contextLabel } = input;

  const header = section('Identificação', headerFields.map(([label, key]) => {
    const raw = data[key];
    const val = raw instanceof Date ? raw.toLocaleDateString('pt-BR')
      : (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}/.test(raw) ? new Date(raw).toLocaleDateString('pt-BR') : raw);
    return kvField('id', label, val);
  }));

  const contextSection = contextKey
    ? section(contextLabel || 'Contexto Observado', [listField('ctx', '', data[contextKey])])
    : null;

  const itemSections = sections.map(s =>
    section(s.label.replace(/^\d+\.\s*/, ''), [listField('sec', '', data[s.id])]),
  );

  const obs = section('Observações Livres', [proseField('obs', '', data.observacoesLivres, { optional: true })]);
  const parecer = data.parecer
    ? section('Parecer Pedagógico', [proseField('par', '', data.parecer)])
    : null;

  return buildSections([header, contextSection, ...itemSections, obs, parecer]);
}

// ─── Regente (Observação de Sala) ────────────────────────────────────────────

export const CHECKLIST_REGENTE_HEADER: Array<[string, string]> = [
  ['Professor(a) Regente', 'professor'],
  ['Série / Turma', 'serie'],
  ['Data da Observação', 'dataObservacao'],
];
export const CHECKLIST_REGENTE_SECTION_KEYS = [
  'atencaoParticipacao', 'comunicacao', 'interacaoSocial', 'autonomia', 'aprendizagem',
  'regulacaoComportamento', 'estrategiasEficazes', 'recomendacoesImediatas',
] as const;

export function checklistRegenteTitle(): string {
  return 'Checklist de Observação — Professor Regente';
}

// ─── Cuidadora ──────────────────────────────────────────────────────────────

export const CHECKLIST_CUIDADORA_HEADER: Array<[string, string]> = [
  ['Cuidadora / Profissional de Apoio', 'cuidadora'],
  ['Turno', 'turno'],
  ['Semana de Referência', 'semanaReferencia'],
  ['Data de Preenchimento', 'dataPreenchimento'],
];
export const CHECKLIST_CUIDADORA_SECTION_KEYS = [
  'chegadaEscola', 'alimentacao', 'higieneBanheiro', 'deslocamentoSeguranca',
  'comunicacaoNecessidades', 'regulacaoEmocional', 'interacaoSocial', 'transicoesRotina',
  'estrategiasEficazes', 'alertasSemana',
] as const;

export function checklistCuidadoraTitle(): string {
  return 'Checklist de Rotina — Cuidadora';
}
