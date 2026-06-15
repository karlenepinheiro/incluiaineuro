import { DocumentType } from '../types';

export type FormalGuardDocKey = 'ESTUDO_CASO' | 'PAEE' | 'PEI' | 'DOCUMENTO_UNIFICADO_PEI_PAEE';

export type FormalSourceSnapshot = {
  estudoCaso: boolean;
  paee: boolean;
  pei: boolean;
};

export const FORMAL_GUARD_MESSAGES = {
  missingCaseStudy: 'Para gerar o PAEE com segurança, é necessário ter um Estudo de Caso registrado para este estudante.',
  missingPAEEForPEI: 'Para gerar o PEI com segurança, é necessário ter um PAEE registrado para este estudante.',
  missingUnifiedPEI: 'Para gerar o Plano Unificado PAEE + PEI com segurança, é necessário ter um PEI registrado para este estudante.',
  missingUnifiedPAEE: 'Para gerar o Plano Unificado PAEE + PEI com segurança, é necessário ter um PAEE registrado para este estudante.',
  missingUnifiedBoth: 'O Plano Unificado PAEE + PEI integra informações do PEI e do PAEE. Gere ou registre esses documentos antes de usar a geração automática.',
} as const;

export const FORMAL_DOCUMENT_ORDER: FormalGuardDocKey[] = [
  'ESTUDO_CASO',
  'PAEE',
  'PEI',
  'DOCUMENTO_UNIFICADO_PEI_PAEE',
];

function hasUsefulValue(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') {
    const clean = value.replace(/<[^>]+>/g, '').trim();
    return clean !== '' && clean !== '-' && clean.toLowerCase() !== 'não informado' && clean.toLowerCase() !== 'nao informado';
  }
  if (Array.isArray(value)) return value.some(hasUsefulValue);
  if (typeof value === 'object') return Object.values(value as Record<string, unknown>).some(hasUsefulValue);
  return true;
}

export function hasUsefulFormalDocumentContent(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  const anyData = data as any;
  if (hasUsefulValue(anyData.contentSummary)) return true;
  const sections = Array.isArray(anyData.sections)
    ? anyData.sections
    : Array.isArray(anyData.structuredData?.sections)
      ? anyData.structuredData.sections
      : Array.isArray(anyData.structured_data?.sections)
        ? anyData.structured_data.sections
        : [];
  return sections.some((section: any) =>
    (Array.isArray(section?.fields) && section.fields.some((field: any) => hasUsefulValue(field?.value)))
  );
}

export function normalizeFormalGuardDocType(type: unknown): FormalGuardDocKey | null {
  const raw = String(type ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_+\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();

  if (!raw) return null;
  if (raw.includes('UNIFICADO') && raw.includes('PEI') && raw.includes('PAEE')) return 'DOCUMENTO_UNIFICADO_PEI_PAEE';
  if (raw === 'DOCUMENTO UNIFICADO PEI PAEE') return 'DOCUMENTO_UNIFICADO_PEI_PAEE';
  if (raw.includes('ESTUDO') && raw.includes('CASO')) return 'ESTUDO_CASO';
  if (raw === 'ESTUDO DE CASO' || raw === 'ESTUDO CASO') return 'ESTUDO_CASO';
  if (raw === 'PAEE') return 'PAEE';
  if (raw === 'PEI') return 'PEI';

  if (type === DocumentType.ESTUDO_CASO) return 'ESTUDO_CASO';
  if (type === DocumentType.PAEE) return 'PAEE';
  if (type === DocumentType.PEI) return 'PEI';
  if (type === DocumentType.DOCUMENTO_UNIFICADO_PEI_PAEE) return 'DOCUMENTO_UNIFICADO_PEI_PAEE';
  return null;
}

export function getFormalAiGuardMessage(target: unknown, sources: FormalSourceSnapshot): string | null {
  const docType = normalizeFormalGuardDocType(target);
  if (!docType || docType === 'ESTUDO_CASO') return null;
  if (docType === 'PAEE') return sources.estudoCaso ? null : FORMAL_GUARD_MESSAGES.missingCaseStudy;
  if (docType === 'PEI') return sources.paee ? null : FORMAL_GUARD_MESSAGES.missingPAEEForPEI;
  if (!sources.pei && !sources.paee) return FORMAL_GUARD_MESSAGES.missingUnifiedBoth;
  if (!sources.pei) return FORMAL_GUARD_MESSAGES.missingUnifiedPEI;
  if (!sources.paee) return FORMAL_GUARD_MESSAGES.missingUnifiedPAEE;
  return null;
}

export function orderFormalDocTypes(types: unknown[]): FormalGuardDocKey[] {
  const normalized = types
    .map(normalizeFormalGuardDocType)
    .filter((type): type is FormalGuardDocKey => !!type);
  return FORMAL_DOCUMENT_ORDER.filter(type => normalized.includes(type));
}

export function getFormalBatchGuardMessage(selectedTypes: unknown[], savedSources: FormalSourceSnapshot): string | null {
  const available = { ...savedSources };
  for (const docType of orderFormalDocTypes(selectedTypes)) {
    const message = getFormalAiGuardMessage(docType, available);
    if (message) return message;
    if (docType === 'ESTUDO_CASO') available.estudoCaso = true;
    if (docType === 'PAEE') available.paee = true;
    if (docType === 'PEI') available.pei = true;
  }
  return null;
}
