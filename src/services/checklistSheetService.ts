// services/checklistSheetService.ts
// Mapa canônico de códigos ENEM-like para os checklists IncluiAI.
// Fonte única de verdade — não duplicar códigos em outros arquivos.

import type { ChecklistRegenteData } from '../components/ChecklistRegenteForm';
import type { ChecklistCuidadoraData } from '../components/ChecklistCuidadoraForm';

// ─── Mapas de código — Regente ─────────────────────────────────────────────────

export const REGENTE_CODE_MAP: Record<string, string> = {
  // A — Atenção e Participação
  A1: 'Mantém atenção por curto período',
  A2: 'Mantém atenção com mediação',
  A3: 'Distrai-se facilmente',
  A4: 'Participa espontaneamente',
  A5: 'Participa quando chamado',
  A6: 'Evita participação',
  A7: 'Necessita de comandos repetidos',
  A8: 'Finaliza atividades',
  A9: 'Abandona atividades antes de concluir',
  // C — Comunicação
  C1: 'Comunica necessidades verbalmente',
  C2: 'Usa gestos/apontar',
  C3: 'Usa frases curtas',
  C4: 'Tem dificuldade para pedir ajuda',
  C5: 'Responde comandos simples',
  C6: 'Demonstra compreensão parcial',
  C7: 'Necessita de apoio visual',
  C8: 'Apresenta ecolalia/repetições',
  C9: 'Não se comunica espontaneamente',
  // S — Interação Social
  S1: 'Interage com colegas',
  S2: 'Prefere ficar sozinho',
  S3: 'Busca adultos',
  S4: 'Aceita ajuda',
  S5: 'Compartilha materiais',
  S6: 'Tem conflitos frequentes',
  S7: 'Demonstra frustração',
  S8: 'Segue combinados sociais com apoio',
  S9: 'Participa de atividades coletivas',
  // U — Autonomia
  U1: 'Organiza materiais',
  U2: 'Precisa de ajuda para iniciar',
  U3: 'Precisa de ajuda para concluir',
  U4: 'Pede ajuda quando necessário',
  U5: 'Usa banheiro com autonomia',
  U6: 'Alimenta-se com autonomia',
  U7: 'Desloca-se com segurança',
  U8: 'Necessita de supervisão constante',
  // P — Aprendizagem
  P1: 'Reconhece letras/números',
  P2: 'Lê palavras/frases',
  P3: 'Copia do quadro',
  P4: 'Registra respostas',
  P5: 'Compreende instruções',
  P6: 'Resolve atividades simples',
  P7: 'Necessita de adaptação',
  P8: 'Necessita de material concreto',
  P9: 'Demonstra conhecimento prévio',
  // R — Comportamento e Regulação
  R1: 'Mantém-se tranquilo',
  R2: 'Apresenta agitação motora',
  R3: 'Demonstra ansiedade',
  R4: 'Apresenta irritabilidade',
  R5: 'Chora com facilidade',
  R6: 'Apresenta recusa',
  R7: 'Necessita de pausa',
  R8: 'Regula-se com apoio',
  R9: 'Reage bem a rotina visual',
  // E — Estratégias Eficazes
  E1: 'Comando curto',
  E2: 'Suporte visual',
  E3: 'Material concreto',
  E4: 'Reforço positivo',
  E5: 'Pausa programada',
  E6: 'Redução de estímulos',
  E7: 'Tempo ampliado',
  E8: 'Atividade em etapas',
  E9: 'Mediação individual',
  // M — Recomendações Imediatas
  M1: 'Manter rotina visual',
  M2: 'Adaptar atividade',
  M3: 'Reduzir quantidade de itens',
  M4: 'Oferecer apoio individual',
  M5: 'Usar material concreto',
  M6: 'Registrar nova observação',
  M7: 'Conversar com família',
  M8: 'Encaminhar para AEE',
  M9: 'Solicitar estudo de caso',
};

// ─── Mapas de código — Cuidadora ──────────────────────────────────────────────

export const CUIDADORA_CODE_MAP: Record<string, string> = {
  // CH — Chegada à Escola
  CH1: 'Chegou tranquilo',
  CH2: 'Chegou choroso',
  CH3: 'Chegou agitado',
  CH4: 'Resistiu à entrada',
  CH5: 'Precisou de acolhimento individual',
  CH6: 'Separou-se bem da família',
  CH7: 'Demonstrou cansaço',
  CH8: 'Trouxe objeto de conforto',
  // AL — Alimentação
  AL1: 'Alimentou-se com autonomia',
  AL2: 'Precisou de ajuda',
  AL3: 'Recusou alimentação',
  AL4: 'Apresentou seletividade alimentar',
  AL5: 'Aceitou novos alimentos',
  AL6: 'Bebeu água com lembrete',
  AL7: 'Apresentou desconforto',
  AL8: 'Necessitou supervisão constante',
  // HI — Higiene e Banheiro
  HI1: 'Usa banheiro com autonomia',
  HI2: 'Solicita ir ao banheiro',
  HI3: 'Precisa ser lembrado',
  HI4: 'Precisa de ajuda parcial',
  HI5: 'Precisa de ajuda total',
  HI6: 'Teve escape',
  HI7: 'Resistiu à higiene',
  HI8: 'Aceitou rotina de higiene',
  // DS — Deslocamento e Segurança
  DS1: 'Desloca-se com autonomia',
  DS2: 'Precisa de acompanhamento',
  DS3: 'Corre sem aviso',
  DS4: 'Afasta-se do grupo',
  DS5: 'Segue combinados com apoio',
  DS6: 'Necessita supervisão em espaços abertos',
  DS7: 'Apresenta risco em escadas/corredores',
  DS8: 'Responde ao chamado do adulto',
  // CN — Comunicação de Necessidades
  CN1: 'Pede ajuda verbalmente',
  CN2: 'Usa gestos/apontar',
  CN3: 'Chora para comunicar',
  CN4: 'Leva adulto até o objeto/local',
  CN5: 'Usa palavras/frases curtas',
  CN6: 'Não comunica necessidade',
  CN7: 'Usa comunicação alternativa',
  CN8: 'Demonstra desconforto por comportamento',
  // RE — Regulação Emocional
  RE1: 'Manteve-se regulado',
  RE2: 'Teve irritabilidade',
  RE3: 'Apresentou choro',
  RE4: 'Apresentou gritos',
  RE5: 'Apresentou fuga/esquiva',
  RE6: 'Teve crise',
  RE7: 'Precisou de pausa',
  RE8: 'Regulou-se com apoio',
  RE9: 'Regulou-se com objeto/estratégia específica',
  // IS — Interação Social
  IS1: 'Busca colegas',
  IS2: 'Prefere ficar sozinho',
  IS3: 'Aceita aproximação',
  IS4: 'Rejeita aproximação',
  IS5: 'Compartilha materiais com apoio',
  IS6: 'Imita colegas',
  IS7: 'Busca adulto com frequência',
  IS8: 'Participa de brincadeiras',
  // TR — Transições de Rotina
  TR1: 'Aceita troca de atividade',
  TR2: 'Resiste a mudanças',
  TR3: 'Precisa de aviso prévio',
  TR4: 'Melhora com rotina visual',
  TR5: 'Apresenta crise em transições',
  TR6: 'Aceita encerramento da atividade',
  TR7: 'Precisa de tempo extra',
  TR8: 'Segue combinados com apoio',
  // EF — Estratégias que Funcionaram
  EF1: 'Rotina visual',
  EF2: 'Antecipação verbal',
  EF3: 'Comando curto',
  EF4: 'Objeto de conforto',
  EF5: 'Pausa sensorial',
  EF6: 'Reforço positivo',
  EF7: 'Música',
  EF8: 'Redução de estímulos',
  EF9: 'Espaço tranquilo',
  EF10: 'Mediação individual',
  // AW — Alertas da Semana
  AW1: 'Mudança de comportamento',
  AW2: 'Sonolência excessiva',
  AW3: 'Agitação incomum',
  AW4: 'Recusa alimentar',
  AW5: 'Crise recorrente',
  AW6: 'Dificuldade de separação da família',
  AW7: 'Sensibilidade sensorial acentuada',
  AW8: 'Necessidade de comunicar família/equipe',
};

// ─── Estrutura das seções para o PDF ENEM-like ────────────────────────────────

export interface SheetSection {
  prefix: string;
  label: string;
  emoji: string;
  codes: string[];
}

export const REGENTE_SHEET_SECTIONS: SheetSection[] = [
  { prefix: 'A',  label: 'A — ATENÇÃO E PARTICIPAÇÃO',      emoji: '👁️', codes: ['A1','A2','A3','A4','A5','A6','A7','A8','A9'] },
  { prefix: 'C',  label: 'C — COMUNICAÇÃO',                 emoji: '💬', codes: ['C1','C2','C3','C4','C5','C6','C7','C8','C9'] },
  { prefix: 'S',  label: 'S — INTERAÇÃO SOCIAL',            emoji: '🤝', codes: ['S1','S2','S3','S4','S5','S6','S7','S8','S9'] },
  { prefix: 'U',  label: 'U — AUTONOMIA',                   emoji: '🧭', codes: ['U1','U2','U3','U4','U5','U6','U7','U8'] },
  { prefix: 'P',  label: 'P — APRENDIZAGEM',                emoji: '📚', codes: ['P1','P2','P3','P4','P5','P6','P7','P8','P9'] },
  { prefix: 'R',  label: 'R — COMPORTAMENTO E REGULAÇÃO',   emoji: '🧘', codes: ['R1','R2','R3','R4','R5','R6','R7','R8','R9'] },
  { prefix: 'E',  label: 'E — ESTRATÉGIAS EFICAZES',        emoji: '✅', codes: ['E1','E2','E3','E4','E5','E6','E7','E8','E9'] },
  { prefix: 'M',  label: 'M — RECOMENDAÇÕES IMEDIATAS',     emoji: '📋', codes: ['M1','M2','M3','M4','M5','M6','M7','M8','M9'] },
];

export const CUIDADORA_SHEET_SECTIONS: SheetSection[] = [
  { prefix: 'CH', label: 'CH — CHEGADA À ESCOLA',              emoji: '🏫', codes: ['CH1','CH2','CH3','CH4','CH5','CH6','CH7','CH8'] },
  { prefix: 'AL', label: 'AL — ALIMENTAÇÃO',                   emoji: '🍽️', codes: ['AL1','AL2','AL3','AL4','AL5','AL6','AL7','AL8'] },
  { prefix: 'HI', label: 'HI — HIGIENE E BANHEIRO',            emoji: '🚿', codes: ['HI1','HI2','HI3','HI4','HI5','HI6','HI7','HI8'] },
  { prefix: 'DS', label: 'DS — DESLOCAMENTO E SEGURANÇA',      emoji: '🚶', codes: ['DS1','DS2','DS3','DS4','DS5','DS6','DS7','DS8'] },
  { prefix: 'CN', label: 'CN — COMUNICAÇÃO DE NECESSIDADES',   emoji: '💬', codes: ['CN1','CN2','CN3','CN4','CN5','CN6','CN7','CN8'] },
  { prefix: 'RE', label: 'RE — REGULAÇÃO EMOCIONAL',           emoji: '🧘', codes: ['RE1','RE2','RE3','RE4','RE5','RE6','RE7','RE8','RE9'] },
  { prefix: 'IS', label: 'IS — INTERAÇÃO SOCIAL',              emoji: '🤝', codes: ['IS1','IS2','IS3','IS4','IS5','IS6','IS7','IS8'] },
  { prefix: 'TR', label: 'TR — TRANSIÇÕES DE ROTINA',          emoji: '🔄', codes: ['TR1','TR2','TR3','TR4','TR5','TR6','TR7','TR8'] },
  { prefix: 'EF', label: 'EF — ESTRATÉGIAS QUE FUNCIONARAM',  emoji: '✅', codes: ['EF1','EF2','EF3','EF4','EF5','EF6','EF7','EF8','EF9','EF10'] },
  { prefix: 'AW', label: 'AW — ALERTAS DA SEMANA ⚠',          emoji: '⚠️', codes: ['AW1','AW2','AW3','AW4','AW5','AW6','AW7','AW8'] },
];

// ─── Conversão: códigos → ChecklistRegenteData ────────────────────────────────

export function codesToRegenteData(
  markedCodes: string[],
  extraFields: Record<string, string>,
  freeNotes?: string,
): Partial<ChecklistRegenteData> {
  const byPrefix: Record<string, string[]> = {};
  for (const code of markedCodes) {
    const prefix = code.replace(/\d+$/, '');
    const text = REGENTE_CODE_MAP[code];
    if (!text) continue;
    (byPrefix[prefix] ??= []).push(text);
  }
  return {
    professor:              extraFields['professor']       ?? '',
    serie:                  extraFields['serie']           ?? '',
    dataObservacao:         extraFields['dataObservacao']  ?? new Date().toISOString().split('T')[0],
    contextoObservado:      [],
    atencaoParticipacao:    byPrefix['A'] ?? [],
    comunicacao:            byPrefix['C'] ?? [],
    interacaoSocial:        byPrefix['S'] ?? [],
    autonomia:              byPrefix['U'] ?? [],
    aprendizagem:           byPrefix['P'] ?? [],
    regulacaoComportamento: byPrefix['R'] ?? [],
    estrategiasEficazes:    byPrefix['E'] ?? [],
    recomendacoesImediatas: byPrefix['M'] ?? [],
    observacoesLivres:      freeNotes ?? '',
  };
}

// ─── Conversão: códigos → ChecklistCuidadoraData ─────────────────────────────

export function codesToCuidadoraData(
  markedCodes: string[],
  extraFields: Record<string, string>,
  freeNotes?: string,
): Partial<ChecklistCuidadoraData> {
  const byPrefix: Record<string, string[]> = {};
  for (const code of markedCodes) {
    // Prefixos podem ter 2+ letras (CH, AL, HI, DS, CN, RE, IS, TR, EF, AW)
    const prefix = code.replace(/\d+$/, '');
    const text = CUIDADORA_CODE_MAP[code];
    if (!text) continue;
    (byPrefix[prefix] ??= []).push(text);
  }
  return {
    cuidadora:               extraFields['cuidadora']        ?? '',
    turno:                   extraFields['turno']            ?? '',
    semanaReferencia:        extraFields['semanaReferencia'] ?? '',
    dataPreenchimento:       extraFields['dataPreenchimento'] ?? new Date().toISOString().split('T')[0],
    chegadaEscola:           byPrefix['CH'] ?? [],
    alimentacao:             byPrefix['AL'] ?? [],
    higieneBanheiro:         byPrefix['HI'] ?? [],
    deslocamentoSeguranca:   byPrefix['DS'] ?? [],
    comunicacaoNecessidades: byPrefix['CN'] ?? [],
    regulacaoEmocional:      byPrefix['RE'] ?? [],
    interacaoSocial:         byPrefix['IS'] ?? [],
    transicoesRotina:        byPrefix['TR'] ?? [],
    estrategiasEficazes:     byPrefix['EF'] ?? [],
    alertasSemana:           byPrefix['AW'] ?? [],
    observacoesLivres:       freeNotes ?? '',
  };
}

// ─── Prompt estruturado para leitura de checklist ENEM-like ──────────────────

export function buildScanPrompt(type: 'checklist_regente' | 'checklist_cuidadora'): string {
  const codeMap     = type === 'checklist_regente' ? REGENTE_CODE_MAP : CUIDADORA_CODE_MAP;
  const validCodes  = Object.keys(codeMap).join(', ');
  const codeEntries = Object.entries(codeMap).map(([k, v]) => `${k}: "${v}"`).join('\n');

  const extraFieldsTemplate = type === 'checklist_regente'
    ? `{ "professor": "", "serie": "", "dataObservacao": "" }`
    : `{ "cuidadora": "", "turno": "", "semanaReferencia": "", "dataPreenchimento": "" }`;

  return `Você é um sistema de leitura óptica de checklists educacionais padronizados (formato IncluiAI ENEM-like v1).

TIPO: ${type === 'checklist_regente' ? 'Checklist Professor Regente' : 'Análise de Rotina Semanal — Cuidadora'}
VERSÃO: ENEM-v1 (cada item tem um código impresso como A1, C3, RE2, AW5, etc.)

CÓDIGOS VÁLIDOS:
${validCodes}

MAPA COMPLETO (código → descrição do item):
${codeEntries}

INSTRUÇÕES:
1. Identifique quais círculos ou quadrados têm marcação visível (X, ●, preenchimento, tique, risco dentro do marcador).
2. Mapeie cada marcação ao código impresso ao lado (A1, C3, AW5, etc.).
3. Use APENAS os códigos da lista acima. Jamais invente códigos.
4. Se a marcação for duvidosa (borrão, rasura, má qualidade): coloque em "uncertainCodes", não em "markedCodes".
5. Extraia dados do cabeçalho: nome do profissional, data, turno/série se visíveis.
6. Transcreva observações manuscritas da área livre em "freeNotes".
7. "overallConfidence": valor de 0.0 a 1.0 refletindo a qualidade geral da imagem e leitura.
   Imagem nítida e marcações claras → acima de 0.8.
   Imagem borrada ou marcações ambíguas → abaixo de 0.6.

RETORNE APENAS JSON válido (sem markdown, sem comentários):
{
  "checklistType": "${type}",
  "schemaVersion": "enem_v1",
  "studentCode": null,
  "markedCodes": [],
  "uncertainCodes": [],
  "extraFields": ${extraFieldsTemplate},
  "freeNotes": "",
  "overallConfidence": 0.8
}`;
}
