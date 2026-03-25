// services/cepService.ts — Auto-preenchimento de endereço via ViaCEP
// API pública, gratuita, sem chave, com CORS aberto.
// Docs: https://viacep.com.br

export interface CepData {
  cep: string;          // "XX.XXX-XXX"
  logradouro: string;   // rua/avenida
  complemento: string;
  bairro: string;
  localidade: string;   // cidade
  uf: string;           // estado (2 letras)
  ibge: string;
  ddd: string;
  erro?: boolean;       // true quando CEP não encontrado
}

/**
 * Normaliza CEP removendo qualquer caractere não numérico.
 */
export function normalizeCep(cep: string): string {
  return cep.replace(/\D/g, '');
}

/**
 * Valida se o CEP tem 8 dígitos.
 */
export function validateCep(cep: string): boolean {
  return /^\d{8}$/.test(normalizeCep(cep));
}

/**
 * Formata CEP no padrão XXXXX-XXX.
 */
export function formatCep(cep: string): string {
  const digits = normalizeCep(cep);
  if (digits.length === 8) return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  return digits;
}

/**
 * Consulta endereço completo a partir do CEP.
 * Retorna null se o CEP não existir ou se houver erro de rede.
 */
export async function fetchAddressByCep(cep: string): Promise<CepData | null> {
  const digits = normalizeCep(cep);

  if (!validateCep(digits)) {
    throw new Error('CEP inválido. Deve conter exatamente 8 dígitos.');
  }

  try {
    const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`, {
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) return null;

    const data: CepData = await res.json();

    // ViaCEP retorna { "erro": true } quando o CEP não é encontrado
    if (data.erro) return null;

    return data;
  } catch (err) {
    console.warn('[cepService] Falha ao consultar ViaCEP:', err);
    return null;
  }
}
