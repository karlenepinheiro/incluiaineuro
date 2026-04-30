/** Formata CPF: 000.000.000-00 */
export const maskCPF = (value: string): string => {
  const d = value.replace(/\D/g, '').slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
};

/** Formata CEP: 00000-000 */
export const maskCEP = (value: string): string => {
  const d = value.replace(/\D/g, '').slice(0, 8);
  return d.replace(/(\d{5})(\d)/, '$1-$2');
};

/** Formata telefone: (00) 00000-0000 ou (00) 0000-0000 */
export const maskPhone = (value: string): string => {
  const d = value.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 10) {
    return d
      .replace(/(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{4})(\d)/, '$1-$2');
  }
  return d
    .replace(/(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{5})(\d)/, '$1-$2');
};

/** Formata data BR: 00/00/0000 */
export const maskDateBR = (value: string): string => {
  const d = value.replace(/\D/g, '').slice(0, 8);
  return d
    .replace(/(\d{2})(\d)/, '$1/$2')
    .replace(/(\d{2})(\d)/, '$1/$2');
};

/** Remove todos os não-dígitos */
export const unmask = (value: string): string => value.replace(/\D/g, '');

/**
 * Valida CPF matematicamente (sem API).
 * Retorna true para CPF válido, false para inválido ou vazio.
 */
export const validateCPF = (value: string): boolean => {
  const d = value.replace(/\D/g, '');

  if (d.length !== 11) return false;

  // Rejeita sequências repetidas: 00000000000, 11111111111, ...
  if (/^(\d)\1{10}$/.test(d)) return false;

  // Primeiro dígito verificador
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(d[i]) * (10 - i);
  let remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(d[9])) return false;

  // Segundo dígito verificador
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(d[i]) * (11 - i);
  remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(d[10])) return false;

  return true;
};