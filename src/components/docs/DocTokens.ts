// DocTokens.ts — Design System Visual IncluiAI • Documentos Oficiais
// Fonte única de tokens: cores, tipografia, espaçamento, sombras, bordas

// ─── Paleta principal ─────────────────────────────────────────────────────────

export const colors = {
  // Marca
  petrol:   '#1F4E5F',
  petrolM:  '#2E6B7A',
  petrolL:  '#E8F2F5',
  petrolXL: '#F0F7FA',
  navy:     '#1E3A5F',
  gold:     '#C69214',
  goldM:    '#F0C040',
  goldL:    '#FFF8E7',
  orange:   '#E85D04', // "AI" no logotipo

  // Neutros
  dark:    '#1C2033',
  gray:    '#6B7280',
  gray2:   '#9CA3AF',
  border:  '#E4E7EC',
  bg:      '#F8FAFC',
  surface: '#FFFFFF',

  // Semânticos
  green:   '#16A34A',
  greenL:  '#DCFCE7',
  red:     '#DC2626',
  redL:    '#FEE2E2',
  amber:   '#D97706',
  amberL:  '#FEF3C7',
  blue:    '#2563EB',
  blueL:   '#DBEAFE',
  purple:  '#7C3AED',
  purpleL: '#EDE9FE',
} as const;

// ─── Acento por tipo de documento ─────────────────────────────────────────────

export const docAccents = {
  relatorio:   { main: colors.petrol,  light: colors.petrolL,  label: 'Relatório'             },
  pei:         { main: colors.blue,    light: colors.blueL,    label: 'PEI'                   },
  paee:        { main: colors.green,   light: colors.greenL,   label: 'PAEE'                  },
  pdi:         { main: colors.purple,  light: colors.purpleL,  label: 'PDI'                   },
  estudoCaso:  { main: colors.gold,    light: colors.goldL,    label: 'Estudo de Caso'        },
  ficha:       { main: colors.petrol,  light: colors.petrolL,  label: 'Ficha do Aluno'        },
  atividade:   { main: '#E85D04',      light: '#FFF0E6',       label: 'Atividade Adaptada'    },
  protocolo:   { main: colors.navy,    light: colors.petrolXL, label: 'Protocolo'             },
} as const;

export type DocType = keyof typeof docAccents;

// ─── Tipografia ───────────────────────────────────────────────────────────────
// Google Fonts: carregar no index.html
// <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">

export const fonts = {
  body:    "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif",
  mono:    "'JetBrains Mono', 'Fira Code', monospace",
} as const;

export const fontSize = {
  '2xs':  9,
  xs:     10,
  sm:     11,
  base:   13,
  md:     14,
  lg:     16,
  xl:     20,
  '2xl':  24,
  '3xl':  28,
} as const;

// ─── Espaçamento ──────────────────────────────────────────────────────────────

export const spacing = {
  xs:  4,
  sm:  8,
  md:  12,
  lg:  16,
  xl:  24,
  '2xl': 32,
  '3xl': 40,
} as const;

// ─── Bordas e arredondamentos ─────────────────────────────────────────────────

export const radius = {
  sm:   6,
  md:   10,
  lg:   12,
  xl:   14,
  '2xl': 16,
  full: 999,
} as const;

// ─── Sombras ──────────────────────────────────────────────────────────────────

export const shadows = {
  sm:   '0 1px 4px rgba(28,32,51,0.06)',
  md:   '0 2px 12px rgba(28,32,51,0.08)',
  lg:   '0 4px 20px rgba(31,78,95,0.12)',
  card: '0 2px 8px rgba(31,78,95,0.08)',
} as const;

// ─── Dimensões A4 ─────────────────────────────────────────────────────────────

export const a4 = {
  width:          '210mm',
  minHeight:      '297mm',
  paddingX:       '10mm',
  paddingY:       '12mm',
  paddingXScreen: 40,   // px para visualização web
  paddingYScreen: 32,
} as const;

// ─── Helper: cor de score ─────────────────────────────────────────────────────

export function scoreColor(s: number) {
  if (s >= 4) return colors.green;
  if (s >= 3) return colors.purple;
  if (s >= 2) return colors.amber;
  return colors.red;
}
export function scoreBg(s: number) {
  if (s >= 4) return colors.greenL;
  if (s >= 3) return colors.purpleL;
  if (s >= 2) return colors.amberL;
  return colors.redL;
}
export function scoreLabel(s: number) {
  if (s >= 4) return 'Avançado';
  if (s >= 3) return 'Em desenvolvimento';
  if (s >= 2) return 'Em construção';
  return 'Suporte intensivo';
}
