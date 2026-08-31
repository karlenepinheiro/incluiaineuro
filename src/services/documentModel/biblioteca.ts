// services/documentModel/biblioteca.ts
// [FASE 2 · BLOCO B] Roteamento da Biblioteca (documentos salvos) para o
// renderer correto do TIPO daquele documento, usando SEMPRE o
// `structured_data` da versão salva (nunca dados atuais).
//
// A Biblioteca não ganha um "quarto formato": ela identifica o tipo, carrega a
// versão e encaminha para PDF/Word/Google Docs canônicos daquele tipo.

import type { DocSection, DocumentData } from '../../types';
import { DocumentType } from '../../types';
import {
  buildSections, proseField, resetFieldSeq, section,
} from './sectionBuilders';
import { relatorioTecnicoToSections, relatorioTecnicoTitle } from './relatorioTecnico';

export interface BibliotecaItemLike {
  doc_type?: string;
  type?: string;
  title?: string;
  structured_data?: any;
  audit_code?: string;
  created_at?: string;
}

export interface BibliotecaRoute {
  /** Rótulo curto (nome de arquivo / painel). */
  docLabel: string;
  /** Título institucional do documento. */
  title: string;
  /** Seções canônicas reconstruídas da versão salva. */
  sections: DocSection[];
  /**
   * Quando o tipo salvo tem `DocumentType` próprio com renderer Word canônico
   * (Fase 1), este campo indica qual — o chamador usa `exportDocumentToWord`.
   * Caso contrário, usa `exportGenericDocumentToWord(sections)`.
   */
  canonicalDocumentType: DocumentType | null;
  /** Dados originais da versão salva (para `exportDocumentToWord`). */
  canonicalData?: DocumentData;
  /** true = atividade do IncluiLAB: NÃO usar renderer de documento formal. */
  isIncluiLabActivity: boolean;
}

const CANONICAL_TYPE_MAP: Record<string, DocumentType> = {
  'PEI': DocumentType.PEI,
  'PAEE': DocumentType.PAEE,
  'PDI': DocumentType.PDI,
  'ESTUDO_CASO': DocumentType.ESTUDO_CASO,
  'Estudo de Caso': DocumentType.ESTUDO_CASO,
  'DOCUMENTO_UNIFICADO_PEI_PAEE': DocumentType.DOCUMENTO_UNIFICADO_PEI_PAEE,
  'Documento Unificado PEI + PAEE': DocumentType.DOCUMENTO_UNIFICADO_PEI_PAEE,
};

function normSections(raw: any): DocSection[] {
  if (raw && Array.isArray(raw.sections)) return raw.sections as DocSection[];
  if (Array.isArray(raw)) return raw as DocSection[];
  return [];
}

export function routeBibliotecaItem(item: BibliotecaItemLike): BibliotecaRoute {
  resetFieldSeq();
  const rawType = String(item.doc_type ?? item.type ?? '').trim();
  const sd = item.structured_data;
  const isIncluiLab = /incluilab|atividade/i.test(rawType) || !!sd?.activity || !!sd?.activityPackage;

  // 1. Relatório Técnico salvo (RelatorioResultado)
  if (/relatorio_tecnico|relat[óo]rio t[ée]cnico/i.test(rawType) || (sd && sd.data && sd.codigoDoc)) {
    return {
      docLabel: 'Relatorio Tecnico',
      title: relatorioTecnicoTitle(sd?.data ?? { tipo: 'simples' }),
      sections: sd?.data ? relatorioTecnicoToSections(sd) : [],
      canonicalDocumentType: null,
      isIncluiLabActivity: false,
    };
  }

  // 2. Documento formal com DocumentType próprio (PEI/PAEE/EC/PDI/Unificado)
  const canonical = CANONICAL_TYPE_MAP[rawType] ?? null;
  const sections = normSections(sd);

  if (canonical) {
    return {
      docLabel: rawType,
      title: item.title || rawType,
      sections,
      canonicalDocumentType: canonical,
      canonicalData: { sections },
      isIncluiLabActivity: false,
    };
  }

  // 3. Fallback genérico: já tem seções → usa direto; senão, corpo bruto.
  if (sections.length) {
    return {
      docLabel: rawType || 'Documento',
      title: item.title || rawType || 'Documento IncluiAI',
      sections,
      canonicalDocumentType: null,
      isIncluiLabActivity: isIncluiLab,
    };
  }

  const bodyText = typeof sd === 'string' ? sd
    : (sd?.content ?? sd?.text ?? sd?.body ?? '');
  return {
    docLabel: rawType || 'Documento',
    title: item.title || rawType || 'Documento IncluiAI',
    sections: buildSections([section('Conteúdo', [proseField('c', '', bodyText)])]),
    canonicalDocumentType: null,
    isIncluiLabActivity: isIncluiLab,
  };
}
