// data/bnccCatalog.ts
export type BNCCGradeKey =
  | "1º ano" | "2º ano" | "3º ano" | "4º ano" | "5º ano"
  | "6º ano" | "7º ano" | "8º ano" | "9º ano";

export type BNCCDisciplineKey =
  | "matematica"
  | "lingua_portuguesa"
  | "ciencias"
  | "historia"
  | "geografia"
  | "arte"
  | "educacao_fisica";

export type BnccCatalog = Record<BNCCDisciplineKey, Partial<Record<BNCCGradeKey, string[]>>>;

/**
 * Catálogo inicial (exemplo) — pronto para ser alimentado via página admin.
 * Você pode começar com alguns códigos e depois ampliar.
 */
export const BNCC_CATALOG: BnccCatalog = {
  matematica: {
    "3º ano": ["EF03MA01","EF03MA02","EF03MA03","EF03MA04","EF03MA05","EF03MA06","EF03MA07","EF03MA08","EF03MA09","EF03MA10"],
  },
  lingua_portuguesa: {
    "3º ano": ["EF03LP01","EF03LP02","EF03LP03","EF03LP04","EF03LP05"],
  },
  ciencias: {
    "3º ano": ["EF03CI01","EF03CI02","EF03CI03"],
  },
  historia: {
    "3º ano": ["EF03HI01","EF03HI02"],
  },
  geografia: {
    "3º ano": ["EF03GE01","EF03GE02"],
  },
  arte: {
    "3º ano": ["EF03AR01","EF03AR02"],
  },
  educacao_fisica: {
    "3º ano": ["EF03EF01","EF03EF02"],
  },
};

export function normalizeDisciplineKey(input: string): BNCCDisciplineKey {
  const s = (input || "").trim().toLowerCase();
  if (s.includes("port")) return "lingua_portuguesa";
  if (s.includes("portugu")) return "lingua_portuguesa";
  if (s.includes("mat")) return "matematica";
  if (s.includes("ciên") || s.includes("cien")) return "ciencias";
  if (s.includes("hist")) return "historia";
  if (s.includes("geo")) return "geografia";
  if (s.includes("arte")) return "arte";
  if (s.includes("ed") && s.includes("fis")) return "educacao_fisica";
  if (s.includes("educa") && s.includes("fis")) return "educacao_fisica";
  // fallback “seguro”
  return "matematica";
}

export function normalizeGradeKey(input: string): BNCCGradeKey {
  const s = (input || "").trim().toLowerCase();

  // Normaliza: "3º Ano", "3o ano", "3 ano", "3ª série" → "3º ano"
  const match = s.match(/([1-9])\s*(º|o|ª)?\s*(ano|série|serie)/i);
  if (match) {
    const n = match[1];
    return `${n}º ano` as BNCCGradeKey;
  }

  // fallback: se já veio certo, tenta mapear
  const clean = s.replace(/\s+/g, " ");
  const map: Record<string, BNCCGradeKey> = {
    "1º ano": "1º ano", "2º ano": "2º ano", "3º ano": "3º ano", "4º ano": "4º ano", "5º ano": "5º ano",
    "6º ano": "6º ano", "7º ano": "7º ano", "8º ano": "8º ano", "9º ano": "9º ano",
  };
  return map[clean] || "3º ano";
}