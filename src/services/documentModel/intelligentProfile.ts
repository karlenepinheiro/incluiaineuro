// services/documentModel/intelligentProfile.ts
// ─────────────────────────────────────────────────────────────────────────────
// [FASE 2 · CORREÇÃO DE PARIDADE] Adaptador: Perfil Inteligente → DocSection[].
//
// FONTE DE VERDADE = o DOCUMENTO FINAL do Perfil Inteligente, i.e. a visualização
// de exibição em IntelligentProfileTab.tsx (blocos "Quem sou eu?" → "Análise
// Multidisciplinar" → "Como Aprende Melhor / Pontos de Cuidado" → "Atividades
// Indicadas" → "Pontos de Observação" → Assinaturas). O PDF dedicado
// (IntelligentProfilePDFDocument.ts) já espelha exatamente esses blocos.
// O JSON bruto (`IntelligentProfileJSON`) NÃO é a fonte de verdade.
//
// Este adaptador produz EXATAMENTE as mesmas seções do documento final → Word e
// Google Docs passam a ter paridade estrutural com a tela e com o PDF.
//
// CLASSIFICAÇÃO DOS CAMPOS DO JSON QUE NÃO ENTRAM NO DOCUMENTO
// (ver INTELLIGENT_PROFILE_FIELD_CLASSIFICATION abaixo e o relatório):
//   - neuropsychologicalReport : conteúdo editável no painel de REVISÃO, mas
//       ausente do layout do documento final (tela impressa + PDF). Não é
//       publicado hoje. → NÃO vai para Word/Google Docs (paridade com PDF/tela).
//   - learningProfile          : idem — editável na revisão, não publicado no
//       documento final. → NÃO vai para Word/Google Docs.
//   - nextSteps                : CONDICIONAL — só é usado como FALLBACK de
//       "Potencialidades" quando `strengths` está vazio (mesma regra da tela e
//       do PDF: `strengths ?? nextSteps`). Sem seção própria.
//   - sourcesConsidered        : METADADO DE AUDITORIA DE GERAÇÃO (quais fontes
//       a IA considerou). Nome técnico, nunca exibido na UI. → NÃO vai para
//       nenhum formato.
//   - changesSinceLastVersion  : METADADO DE CHANGELOG entre versões. Nunca
//       exibido na UI. → NÃO vai para nenhum formato.
//   - bestLearningStrategies.text        : a tela e o PDF renderizam só `.items`.
//   - recommendedActivities[].incluiLabPrompt : prompt técnico interno.
//   - humanizedIntroduction.title        : usado só como rótulo, não como conteúdo.
//
// Exporta a VERSÃO recebida (o chamador passa o profile_json da versão
// SELECIONADA — nunca "a mais recente" implicitamente).

import type { DocSection } from '../../types';
import type {
  ChecklistItem, IntelligentProfileJSON, RecommendedActivity,
} from '../intelligentProfileService';
import {
  buildSections, gridField, kvField, listField, proseField, resetFieldSeq, section,
} from './sectionBuilders';

const STATUS_LABEL: Record<ChecklistItem['status'], string> = {
  presente: 'Presente',
  em_desenvolvimento: 'Em desenvolvimento',
  nao_observado: 'Não observado',
};

/** Seções do DOCUMENTO FINAL, na ordem exata da tela e do PDF. Fonte única. */
export const INTELLIGENT_PROFILE_DOC_SECTIONS = [
  'Identificação',
  'Quem sou eu?',
  'Parecer Pedagógico Educacional',
  'Parecer Neuropedagógico',
  'Potencialidades',
  'Como Aprende Melhor',
  'Pontos de Cuidado',
  'Atividades Indicadas',
  'Pontos de Observação',
] as const;

/**
 * Classificação (para o relatório e o teste de paridade) de cada campo do JSON
 * quanto à sua presença no DOCUMENTO FINAL.
 */
export const INTELLIGENT_PROFILE_FIELD_CLASSIFICATION: Record<string, {
  categoria: 'final_exibido' | 'condicional' | 'metadado_interno' | 'revisao_nao_publicada';
  publicaNoDocumento: boolean;
  motivo: string;
}> = {
  studentName:              { categoria: 'final_exibido', publicaNoDocumento: true,  motivo: 'Identificação do aluno.' },
  version:                  { categoria: 'final_exibido', publicaNoDocumento: true,  motivo: 'Rodapé do documento (Versão N).' },
  generatedBy:              { categoria: 'final_exibido', publicaNoDocumento: true,  motivo: 'Rodapé "Emitido por".' },
  generatedAt:              { categoria: 'final_exibido', publicaNoDocumento: true,  motivo: 'Rodapé "Data".' },
  firstPersonLetter:        { categoria: 'final_exibido', publicaNoDocumento: true,  motivo: 'Bloco "Quem sou eu?" (prioridade sobre humanizedIntroduction.text).' },
  humanizedIntroduction:    { categoria: 'condicional',   publicaNoDocumento: true,  motivo: '.text é fallback de "Quem sou eu?"; .title é só rótulo.' },
  pedagogicalReport:        { categoria: 'final_exibido', publicaNoDocumento: true,  motivo: 'Parecer Pedagógico Educacional + Status de Habilidades.' },
  neuroPedagogicalReport:   { categoria: 'final_exibido', publicaNoDocumento: true,  motivo: 'Parecer Neuropedagógico + Status Cognitivo.' },
  strengths:                { categoria: 'final_exibido', publicaNoDocumento: true,  motivo: 'Bloco "Potencialidades".' },
  bestLearningStrategies:   { categoria: 'final_exibido', publicaNoDocumento: true,  motivo: 'Bloco "Como Aprende Melhor" — apenas .items (a tela e o PDF ignoram .text).' },
  challenges:               { categoria: 'final_exibido', publicaNoDocumento: true,  motivo: 'Bloco "Pontos de Cuidado".' },
  carePoints:               { categoria: 'condicional',   publicaNoDocumento: true,  motivo: 'Fallback de "Pontos de Cuidado" quando challenges está vazio (mesma regra da tela/PDF).' },
  recommendedActivities:    { categoria: 'final_exibido', publicaNoDocumento: true,  motivo: 'Bloco "Atividades Indicadas" — sem o campo técnico incluiLabPrompt.' },
  observationPoints:        { categoria: 'final_exibido', publicaNoDocumento: true,  motivo: 'Bloco "Pontos de Observação" + Checklist Diário.' },
  nextSteps:                { categoria: 'condicional',   publicaNoDocumento: true,  motivo: 'Só como FALLBACK de "Potencialidades" (strengths ?? nextSteps) — mesma regra da tela e do PDF. Sem seção própria.' },
  neuropsychologicalReport: { categoria: 'revisao_nao_publicada', publicaNoDocumento: false, motivo: 'Editável no painel de revisão (v2+), mas o layout do documento final — tela impressa E PDF dedicado — não possui a seção "Parecer Neuropsicológico". Não é publicado hoje. Incluí-lo exige adicionar uma seção ao documento final (decisão de produto + auditoria de estética, fora do escopo).' },
  learningProfile:          { categoria: 'revisao_nao_publicada', publicaNoDocumento: false, motivo: 'Editável no painel de revisão (v2+), ausente do documento final (tela + PDF). Conceitualmente sobreposto a "Como Aprende Melhor" (bestLearningStrategies). Não é publicado hoje.' },
  sourcesConsidered:        { categoria: 'metadado_interno', publicaNoDocumento: false, motivo: 'Metadado de auditoria de geração — quais fontes a IA considerou. Nome técnico, nunca exibido na UI. Não é conteúdo do documento.' },
  changesSinceLastVersion:  { categoria: 'metadado_interno', publicaNoDocumento: false, motivo: 'Metadado de changelog entre versões. Nunca exibido na UI. Não é conteúdo do documento.' },
};

/** Campos que NÃO podem aparecer em nenhum formato (teste de vazamento). */
export const INTELLIGENT_PROFILE_INTERNAL_FIELDS = Object.entries(INTELLIGENT_PROFILE_FIELD_CLASSIFICATION)
  .filter(([, c]) => !c.publicaNoDocumento)
  .map(([k]) => k);

/** Nomes técnicos em inglês que nunca podem aparecer no documento. */
export const INTELLIGENT_PROFILE_TECH_NAMES = [
  'neuropsychologicalReport', 'learningProfile', 'sourcesConsidered',
  'changesSinceLastVersion', 'nextSteps', 'incluiLabPrompt', 'humanizedIntroduction',
  'bestLearningStrategies', 'recommendedActivities', 'observationPoints',
  'pedagogicalReport', 'neuroPedagogicalReport', 'attentionSpan', 'supportLevel',
];

function statusRows(items: ChecklistItem[] | undefined): string[][] {
  return (items ?? []).map(i => [i.label, STATUS_LABEL[i.status] ?? String(i.status)]);
}

function activitiesSection(acts: RecommendedActivity[] | undefined): DocSection | null {
  const list = acts ?? [];
  if (!list.length) return null;
  return section('Atividades Indicadas',
    list.flatMap((a, i) => [
      kvField('act', `${i + 1}. ${a.title}`, `Apoio ${a.supportLevel}`),
      ...proseField('act', 'Objetivo', a.objective),
      ...proseField('act', 'Como aplicar', a.howToApply),
      ...proseField('act', 'Por que ajuda', a.whyItHelps),
    ]),
  );
}

export function intelligentProfileTitle(version?: number): string {
  return version != null ? `Perfil Inteligente do Aluno — Versão ${version}` : 'Perfil Inteligente do Aluno';
}

export function intelligentProfileToSections(profile: IntelligentProfileJSON): DocSection[] {
  resetFieldSeq();

  // Mesmas regras condicionais da tela / do PDF:
  const potencialidades = (profile.strengths?.length ? profile.strengths : profile.nextSteps) ?? [];
  const pontosCuidado = (profile.challenges?.length
    ? profile.challenges.map(c => (c.description ? `${c.title}: ${c.description}` : c.title))
    : profile.carePoints) ?? [];

  return buildSections([
    section('Identificação', [
      kvField('id', 'Aluno(a)', profile.studentName),
      kvField('id', 'Versão', profile.version != null ? String(profile.version) : ''),
      kvField('id', 'Emitido por', profile.generatedBy),
      kvField('id', 'Data', profile.generatedAt ? new Date(profile.generatedAt).toLocaleString('pt-BR') : ''),
    ]),

    section('Quem sou eu?', [
      proseField('who', '', profile.firstPersonLetter || profile.humanizedIntroduction?.text),
    ]),

    section('Parecer Pedagógico Educacional', [
      proseField('ped', '', profile.pedagogicalReport?.text),
      gridField('ped', 'Status de Habilidades', ['Habilidade', 'Status'], statusRows(profile.pedagogicalReport?.checklist)),
    ]),

    section('Parecer Neuropedagógico', [
      proseField('npd', '', profile.neuroPedagogicalReport?.text),
      gridField('npd', 'Status Cognitivo', ['Aspecto', 'Status'], statusRows(profile.neuroPedagogicalReport?.checklist)),
    ]),

    section('Potencialidades', [listField('str', '', potencialidades)]),

    section('Como Aprende Melhor', [listField('bls', '', profile.bestLearningStrategies?.items)]),

    section('Pontos de Cuidado', [listField('care', '', pontosCuidado)]),

    activitiesSection(profile.recommendedActivities),

    section('Pontos de Observação', [
      proseField('obs', '', profile.observationPoints?.text),
      listField('obs', 'Checklist Diário', profile.observationPoints?.checklist),
    ]),
  ]);
}
