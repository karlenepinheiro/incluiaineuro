export type DocumentCodeKind = 'validation' | 'registration';

export const INCLUIAI_SITE = 'www.incluiai.app.br';

const VALIDATED_TYPES = new Set(['PEI', 'PAEE', 'ESTUDO_CASO', 'ESTUDO DE CASO']);
const SUFFIX_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

export function normalizeDocumentType(type?: string | null): string {
  return String(type ?? '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

export function isValidatedDocumentType(type?: string | null): boolean {
  const normalized = normalizeDocumentType(type);
  return VALIDATED_TYPES.has(normalized) || VALIDATED_TYPES.has(normalized.replace(/\s+/g, '_'));
}

export function getDocumentCodeKind(type?: string | null): DocumentCodeKind {
  return isValidatedDocumentType(type) ? 'validation' : 'registration';
}

export function generateDocumentCode(kind: DocumentCodeKind, date = new Date()): string {
  let suffix = '';
  for (let i = 0; i < 4; i++) {
    suffix += SUFFIX_CHARS.charAt(Math.floor(Math.random() * SUFFIX_CHARS.length));
  }
  return buildDocumentCode(kind, date, suffix);
}

export function generateDocumentCodeFromSeed(kind: DocumentCodeKind, date: string | Date, seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  let suffix = '';
  let value = Math.abs(hash);
  for (let i = 0; i < 4; i++) {
    suffix += SUFFIX_CHARS.charAt(value % SUFFIX_CHARS.length);
    value = Math.floor(value / SUFFIX_CHARS.length);
  }
  return buildDocumentCode(kind, date, suffix.padEnd(4, 'X'));
}

function buildDocumentCode(kind: DocumentCodeKind, dateInput: string | Date, suffix: string): string {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const prefix = kind === 'validation' ? 'VAL' : 'REG';
  const yyyy = String(safeDate.getFullYear());
  const mm = String(safeDate.getMonth() + 1).padStart(2, '0');
  const dd = String(safeDate.getDate()).padStart(2, '0');
  const hh = String(safeDate.getHours()).padStart(2, '0');
  const mi = String(safeDate.getMinutes()).padStart(2, '0');
  const ss = String(safeDate.getSeconds()).padStart(2, '0');
  return `${prefix}-${yyyy}${mm}${dd}-${hh}${mi}${ss}-${suffix}`;
}

export function codeKindFromCode(code?: string | null): DocumentCodeKind | null {
  const value = String(code ?? '').trim().toUpperCase();
  if (/^VAL-\d{8}-\d{6}-[A-Z0-9]{4}$/.test(value)) return 'validation';
  if (/^REG-\d{8}-\d{6}-[A-Z0-9]{4}$/.test(value)) return 'registration';
  return null;
}

export function ensureDocumentCode(kind: DocumentCodeKind, existing?: string | null): string {
  const value = String(existing ?? '').trim().toUpperCase();
  const existingKind = codeKindFromCode(value);
  if (existingKind === kind) return value;
  return generateDocumentCode(kind);
}

export function formatGeneratedAt(dateInput?: string | Date | null): string {
  const raw = dateInput ? new Date(dateInput) : new Date();
  const date = Number.isNaN(raw.getTime()) ? new Date() : raw;
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).replace(',', ' às');
}

export function validationUrl(code: string): string {
  return `https://${INCLUIAI_SITE}/validar/${encodeURIComponent(code)}`;
}
