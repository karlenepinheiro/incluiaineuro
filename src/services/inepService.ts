/**
 * inepService.ts — Busca de dados escolares via Código INEP
 *
 * Estratégia (tentada em ordem de confiabilidade):
 *  1. BrasilAPI (CORS aberto, base INEP/Educacenso, mais confiável)
 *  2. QEdu API
 *  3. INEP Data via proxy corsproxy.io
 *  4. allorigins.win → INEP Data
 *  5. Retorna null → usuário preenche manualmente
 */

export interface INEPSchoolData {
  schoolName?: string;
  address?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  zipcode?: string;
  contact?: string;
  principalName?: string;
  type?: string;
  stage?: string;
}

export function validateINEPCode(code: string): boolean {
  return /^\d{8}$/.test(code.replace(/\D/g, ''));
}

export async function fetchSchoolByINEP(inepCode: string): Promise<INEPSchoolData | null> {
  const code = inepCode.replace(/\D/g, '');
  if (!validateINEPCode(code)) {
    throw new Error('Código INEP inválido. Deve conter exatamente 8 dígitos.');
  }

  // 1. BrasilAPI — CORS aberto, mais confiável
  try {
    const res = await fetch(
      `https://brasilapi.com.br/api/escola/v1/${code}`,
      { signal: AbortSignal.timeout(6000) }
    );
    if (res.ok) {
      const d = await res.json();
      if (d?.nome_da_escola || d?.nome) return mapBrasilAPI(d);
    }
  } catch { /* segue */ }

  // 2. QEdu API
  try {
    const res = await fetch(
      `https://api.qedu.org.br/v1/escolas?inep=${code}`,
      { signal: AbortSignal.timeout(6000), headers: { Accept: 'application/json' } }
    );
    if (res.ok) {
      const json = await res.json();
      const d = Array.isArray(json?.data) ? json.data[0] : (json?.data ?? json);
      if (d?.name || d?.nome) return mapQEdu(d);
    }
  } catch { /* segue */ }

  // 3. INEP Data via corsproxy.io
  try {
    const inepUrl = `https://inepdata.inep.gov.br/analytics/api/v1/escola?codigoInep=${code}`;
    const res = await fetch(`https://corsproxy.io/?${encodeURIComponent(inepUrl)}`, {
      signal: AbortSignal.timeout(8000),
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
      const data = await res.json();
      const mapped = mapINEPData(data);
      if (mapped) return mapped;
    }
  } catch { /* segue */ }

  // 4. allorigins.win → INEP Data
  try {
    const inepUrl = `https://inepdata.inep.gov.br/analytics/api/v1/escola?codigoInep=${code}`;
    const res = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(inepUrl)}`, {
      signal: AbortSignal.timeout(9000),
    });
    if (res.ok) {
      const text = await res.text();
      if (text.startsWith('{') || text.startsWith('[')) {
        const mapped = mapINEPData(JSON.parse(text));
        if (mapped) return mapped;
      }
    }
  } catch { /* esgotado */ }

  return null;
}

function mapBrasilAPI(d: any): INEPSchoolData {
  return {
    schoolName:    d.nome_da_escola ?? d.nome ?? undefined,
    address:       d.logradouro && d.numero ? `${d.logradouro}, ${d.numero}` : (d.logradouro ?? d.endereco ?? undefined),
    neighborhood:  d.bairro ?? undefined,
    city:          d.municipio ?? d.nome_municipio ?? undefined,
    state:         d.uf ?? d.sigla_uf ?? undefined,
    zipcode:       formatZip(d.cep) ?? undefined,
    contact:       d.telefone ?? undefined,
    principalName: d.nome_diretor ?? undefined,
    type:          d.dependencia_administrativa ?? undefined,
    stage:         d.etapas_ensino ?? undefined,
  };
}

function mapQEdu(d: any): INEPSchoolData {
  return {
    schoolName: d.name ?? d.nome ?? undefined,
    address:    d.address ?? d.endereco ?? undefined,
    city:       d.city ?? d.municipio ?? undefined,
    state:      d.state ?? d.uf ?? undefined,
    zipcode:    formatZip(d.zipcode ?? d.cep) ?? undefined,
  };
}

function mapINEPData(data: any): INEPSchoolData | null {
  if (!data) return null;
  const d = Array.isArray(data) ? data[0] : data;
  if (!d) return null;
  const hasAny = d.noEscola || d.nome_escola || d.name || d.dsEndereco || d.endereco;
  if (!hasAny) return null;
  return {
    schoolName:   d.noEscola    ?? d.nome_escola ?? d.name       ?? undefined,
    address:      d.dsEndereco  ?? d.endereco    ?? d.address     ?? undefined,
    neighborhood: d.dsBairro    ?? d.bairro      ?? undefined,
    city:         d.noMunicipio ?? d.municipio   ?? d.city        ?? undefined,
    state:        d.sgUf        ?? d.uf          ?? d.state       ?? undefined,
    zipcode:      formatZip(d.nrCep ?? d.cep     ?? d.zipcode)   ?? undefined,
    contact:      d.nuTelefone  ?? d.telefone    ?? d.contact     ?? undefined,
  };
}

function formatZip(raw: any): string | undefined {
  if (!raw) return undefined;
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length === 8) return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  return digits || undefined;
}
