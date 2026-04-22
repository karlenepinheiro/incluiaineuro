/** Converts ISO (YYYY-MM-DD) or DD/MM/YYYY to DD/MM/YYYY. Safe for display in documents. */
export function formatDateBR(date: string | undefined | null): string {
  if (!date) return '';
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(date)) return date;
  const iso = date.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  try {
    const d = new Date(date.length <= 10 ? date + 'T12:00:00' : date);
    if (!isNaN(d.getTime())) return d.toLocaleDateString('pt-BR');
  } catch {}
  return date;
}

/** Returns age in full years. Accepts ISO (YYYY-MM-DD) or DD/MM/YYYY. Returns 0 if invalid. */
export function calculateAge(birthDate: string | undefined | null): number {
  if (!birthDate) return 0;
  let d = 0, m = 0, y = 0;
  const ddmm = birthDate.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const iso   = birthDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ddmm)     { d = +ddmm[1]; m = +ddmm[2]; y = +ddmm[3]; }
  else if (iso) { y = +iso[1];  m = +iso[2];  d = +iso[3];  }
  else return 0;
  if (!y || !m || !d) return 0;
  const today = new Date();
  let age = today.getFullYear() - y;
  if (today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d)) age--;
  return age >= 0 ? age : 0;
}

/** Returns age as a formatted string like "10 anos". Empty string if invalid. */
export function calculateAgeStr(birthDate: string | undefined | null): string {
  const age = calculateAge(birthDate);
  return age > 0 ? `${age} anos` : '';
}