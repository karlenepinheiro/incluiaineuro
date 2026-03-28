/**
 * inepService.ts — Busca de dados escolares via Código INEP
 *
 * Estratégia (tentada em ordem de confiabilidade):
 *  1. BrasilAPI (CORS aberto, base INEP/Educacenso, mais confiável)
 *  2. INEP Data via corsproxy.io
 *  3. allorigins.win → INEP Data
 *  4. Retorna null → usuário preenche manualmente
 *
 * Erros classificados:
 *  - 'invalid'   → código fora do padrão (não 8 dígitos)
 *  - 'not_found' → fontes consultadas, escola não localizada
 *  - 'network'   → falha de rede (sem internet / timeout generalizado)
 */

export type INEPFetchError = 'invalid' | 'not_found' | 'network';

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

/**
 * Busca escola pelo código INEP.
 * Lança um objeto `{ type: INEPFetchError }` ao falhar — use em catch para
 * distinguir código inválido, escola não encontrada e falha de rede.
 */
export async function fetchSchoolByINEP(inepCode: string): Promise<INEPSchoolData | null> {
  const code = inepCode.replace(/\D/g, '');
  if (!validateINEPCode(code)) {
    const err: any = new Error('Código INEP inválido. Deve conter exatamente 8 dígitos.');
    err.type = 'invalid' as INEPFetchError;
    throw err;
  }

  let networkErrors = 0;

  // 1. BrasilAPI — CORS aberto, mais confiável
  // Resposta usa nomenclatura INEP: noEntidade (nome), dsEndereco, noMunicipio, sgUf, nrCep…
  try {
    const res = await fetch(
      `https://brasilapi.com.br/api/escola/v1/${code}`,
      { signal: AbortSignal.timeout(6000) }
    );
    if (res.status === 404) {
      // código bem formado mas escola não cadastrada na BrasilAPI — tenta próxima fonte
    } else if (res.ok) {
      const d = await res.json();
      // Aceita tanto nomenclatura INEP (noEntidade) quanto variantes camelCase/snake_case
      const name =
        d?.noEntidade ?? d?.nomeEscola ?? d?.nome_da_escola ?? d?.nome ?? d?.school_name;
      if (name) return mapBrasilAPI(d);
      // Último recurso: tenta mapeamento genérico INEP sobre o mesmo payload
      const fallback = mapINEPData(d);
      if (fallback) return fallback;
    }
  } catch { networkErrors++; }

  // 2. INEP Data via corsproxy.io
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
  } catch { networkErrors++; }

  // 3. allorigins.win → INEP Data
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
  } catch { networkErrors++; }

  // Todas as fontes falharam com erro de rede?
  if (networkErrors === 3) {
    const err: any = new Error('Sem conexão com as fontes INEP. Verifique sua internet.');
    err.type = 'network' as INEPFetchError;
    throw err;
  }

  // Fontes responderam mas escola não foi localizada
  return null;
}

function mapBrasilAPI(d: any): INEPSchoolData {
  // BrasilAPI retorna nomenclatura INEP (noEntidade, dsEndereco, noMunicipio, sgUf…)
  // mas também pode retornar variantes camelCase/snake_case
  const name   = d.noEntidade   ?? d.nomeEscola    ?? d.nome_da_escola ?? d.nome    ?? undefined;
  const street = d.dsEndereco   ?? d.logradouro    ?? d.endereco       ?? undefined;
  const number = d.nrPredio     ?? d.numero        ?? d.numeroEndereco ?? undefined;
  const address = street && number ? `${street}, ${number}` : street;
  const ddd    = d.nuDdd        ?? d.ddd;
  const tel    = d.nuTelefone   ?? d.telefone;
  return {
    schoolName:    name,
    address,
    neighborhood:  d.dsBairro    ?? d.bairro         ?? d.bairroEndereco   ?? undefined,
    city:          d.noMunicipio ?? d.municipio       ?? d.nomeMunicipio    ?? d.nome_municipio ?? undefined,
    state:         d.sgUf        ?? d.uf              ?? d.siglaUf          ?? d.sigla_uf       ?? undefined,
    zipcode:       formatZip(d.nrCep ?? d.cep ?? d.cepEndereco)            ?? undefined,
    contact:       (ddd && tel) ? `(${ddd}) ${tel}` : (tel ?? undefined),
    principalName: d.noGestor    ?? d.nomeGestor      ?? d.nome_diretor     ?? undefined,
    type:          d.tpDependencia ?? d.dependenciaAdministrativa ?? d.dependencia_administrativa ?? undefined,
    stage:         d.etapasEnsino  ?? d.etapas_ensino ?? undefined,
  };
}


function mapINEPData(data: any): INEPSchoolData | null {
  if (!data) return null;
  const d = Array.isArray(data) ? data[0] : data;
  if (!d) return null;
  const hasAny = d.noEntidade || d.noEscola || d.nome_escola || d.name || d.dsEndereco || d.endereco;
  if (!hasAny) return null;
  return {
    schoolName:   d.noEntidade  ?? d.noEscola   ?? d.nome_escola ?? d.name ?? undefined,
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
