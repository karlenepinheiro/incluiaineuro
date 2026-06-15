const STUDENT_CODE_PREFIX = 'INC';
const STUDENT_CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const STUDENT_CODE_PATTERN = /^INC-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

export function generateStudentUniqueCode(existingCodes: Iterable<string | null | undefined> = []): string {
  const used = new Set(
    Array.from(existingCodes)
      .map(code => normalizeStudentUniqueCode(code))
      .filter((code): code is string => !!code)
  );

  for (let attempt = 0; attempt < 50; attempt++) {
    let code = `${STUDENT_CODE_PREFIX}-`;
    for (let i = 0; i < 4; i++) code += STUDENT_CODE_CHARS[Math.floor(Math.random() * STUDENT_CODE_CHARS.length)];
    code += '-';
    for (let i = 0; i < 4; i++) code += STUDENT_CODE_CHARS[Math.floor(Math.random() * STUDENT_CODE_CHARS.length)];
    if (!used.has(code)) return code;
  }

  throw new Error('Não foi possível gerar um código único de aluno.');
}

export function normalizeStudentUniqueCode(value: unknown): string | null {
  const raw = String(value ?? '').trim().toUpperCase();
  if (!raw) return null;

  const compact = raw.replace(/[^A-Z0-9]/g, '');
  if (compact.startsWith(STUDENT_CODE_PREFIX) && compact.length === 11) {
    const normalized = `${STUDENT_CODE_PREFIX}-${compact.slice(3, 7)}-${compact.slice(7, 11)}`;
    return STUDENT_CODE_PATTERN.test(normalized) ? normalized : null;
  }

  const withPrefix = `${STUDENT_CODE_PREFIX}-${compact.slice(0, 4)}-${compact.slice(4, 8)}`;
  if (compact.length === 8 && STUDENT_CODE_PATTERN.test(withPrefix)) return withPrefix;

  return STUDENT_CODE_PATTERN.test(raw) ? raw : null;
}

export function ensureStudentUniqueCode(
  value: unknown,
  existingCodes: Iterable<string | null | undefined> = [],
): string {
  return normalizeStudentUniqueCode(value) ?? generateStudentUniqueCode(existingCodes);
}
