// services/documentModel/relatorioTecnico.ts
// ─────────────────────────────────────────────────────────────────────────────
// [FASE 2] Adaptador: RelatorioResultado → DocSection[] para o Word canônico.
//
// A ordem das seções segue EXATAMENTE a do PDF canônico
// (exportService.exportRelatorioAlunoPDF). Cobre os três modos do mesmo fluxo:
// 'simples', 'inss' e 'completo' — NÃO são documentos diferentes, apenas
// variações de `data.tipo` da mesma estrutura RelatorioResultado.
//
// Nenhuma IA, nenhum acesso a rede, nenhuma dependência de DOM.

import type { DocSection } from '../../types';
import type {
  RelatorioResultado,
  RelatorioCompleto,
  RelatorioSimples,
} from '../reportService';
import {
  buildSections,
  gridField,
  kvField,
  listField,
  proseField,
  resetFieldSeq,
  section,
} from './sectionBuilders';

/** Mesmos rótulos usados no PDF (exportEvolutionReportPDF / exportRelatorioAlunoPDF). */
export const REPORT_CRITERIA_NAMES = [
  'Comunicação Expressiva', 'Interação Social', 'Autonomia (AVD)',
  'Autorregulação', 'Atenção Sustentada', 'Compreensão',
  'Motricidade Fina', 'Motricidade Grossa', 'Participação', 'Linguagem/Leitura',
];

export interface RelatorioAdapterOptions {
  /** Escala de avaliação multidimensional (quando houver). */
  scores?: number[];
  criteriaNames?: string[];
}

export function relatorioTecnicoTitle(data: RelatorioResultado['data']): string {
  if (data.tipo === 'completo') return 'Relatório Técnico Pedagógico';
  if ((data as RelatorioSimples).tipo === 'inss') return 'Relatório Técnico Pedagógico — Modelo INSS';
  return 'Relatório Técnico Pedagógico';
}

export function relatorioTecnicoToSections(
  resultado: RelatorioResultado,
  opts: RelatorioAdapterOptions = {},
): DocSection[] {
  resetFieldSeq();
  const data = resultado.data;
  const completo = data.tipo === 'completo' ? (data as RelatorioCompleto) : null;
  const simples = data.tipo !== 'completo' ? (data as RelatorioSimples) : null;
  const scores = opts.scores ?? [];
  const names = opts.criteriaNames ?? REPORT_CRITERIA_NAMES;

  const checklistRows = (completo?.checklist ?? []).map(item => [
    item.area,
    item.presente ? 'Presente' : 'Preservado',
    item.grau ? item.grau[0].toUpperCase() + item.grau.slice(1) : '—',
    item.obs ?? '',
  ]);

  const scoreRows = scores.map((s, i) => [names[i] ?? `Critério ${i + 1}`, `${s}/5`]);
  const media = scores.length
    ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1)
    : null;

  return buildSections([
    completo && section('Resumo Executivo', [
      proseField('resumo', '', completo.resumoExecutivo),
    ]),

    section('Identificação do Aluno', [
      proseField('identificacao', '', data.identificacao),
    ]),

    // Ordem alinhada à TELA (RelatorioViewer): o "Perfil Multidimensional"
    // (escala + média) vem logo após a identificação. O PDF dedicado atual
    // posiciona a escala mais ao fim — divergência tela↔PDF registrada no
    // relatório (o PDF pré-existente não foi alterado).
    completo && scoreRows.length > 0 && section('Avaliação Multidimensional (Escala 1–5)', [
      gridField('escala', '', ['Critério', 'Nota'], scoreRows),
      ...(media ? [kvField('escala', 'Média geral', `${media}/5`)] : []),
    ]),

    completo && section('Histórico Relevante', [
      proseField('historico', '', completo.historicoRelevante),
    ]),

    section(
      completo ? 'Análise Pedagógica' : 'Situação Pedagógica Atual',
      [proseField('analise', '', completo
        ? completo.analisePedagogica
        : simples?.situacaoPedagogicaAtual)],
    ),

    section('Situação Funcional', [
      proseField('funcional', '', data.situacaoFuncional),
    ]),

    completo && section('Perfil Cognitivo e Funcional', [
      proseField('perfil_cog', '', completo.perfilCognitivo),
    ]),

    section('Dificuldades Observadas', [
      listField('dificuldades', '', data.dificuldades),
    ]),

    completo && section('Potencialidades e Habilidades', [
      listField('potencialidades', '', completo.potencialidades),
    ]),

    completo && section('Estratégias com Resultados Positivos', [
      listField('estrategias', '', completo.estrategiasEficazes),
    ]),

    completo && checklistRows.length > 0 && section('Checklist de Áreas de Desenvolvimento', [
      gridField('checklist', '', ['Área', 'Situação', 'Grau', 'Observação'], checklistRows),
    ]),

    completo && section('Evolução Observada', [
      proseField('evolucao', '', completo.evolucaoObservada),
    ]),

    section('Observações Relevantes', [
      proseField('observacoes', '', data.observacoesRelevantes),
    ]),

    // Escala no modo SIMPLES (quando houver) — no modo completo já apareceu acima.
    !completo && scoreRows.length > 0 && section('Avaliação Multidimensional (Escala 1–5)', [
      gridField('escala', '', ['Critério', 'Nota'], scoreRows),
      ...(media ? [kvField('escala', 'Média geral', `${media}/5`)] : []),
    ]),

    section('Conclusão e Parecer Técnico', [
      proseField('conclusao', '', data.conclusao),
    ]),

    completo
      ? section('Recomendações Multidisciplinares', [
          listField('rec_ped', 'Recomendações Pedagógicas', completo.recomendacoesPedagogicas),
          listField('rec_cli', 'Recomendações Clínicas', completo.recomendacoesClinicas),
          listField('rec_fam', 'Recomendações Familiares', completo.recomendacoesFamiliares),
          listField('rec_ins', 'Recomendações Institucionais', completo.recomendacoesInstitucionais),
        ])
      : section('Recomendações', [
          listField('recomendacoes', '', simples?.recomendacoes),
        ]),
  ]);
}

/** Rótulo curto para nome de arquivo e painel de exportação. */
export function relatorioTecnicoDocLabel(data: RelatorioResultado['data']): string {
  if ((data as RelatorioSimples).tipo === 'inss') return 'Relatorio Tecnico INSS';
  if (data.tipo === 'completo') return 'Relatorio Tecnico Completo';
  return 'Relatorio Tecnico';
}
