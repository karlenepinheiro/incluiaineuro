// DocComponents.tsx — Componentes Reutilizáveis de Documentos • IncluiAI
// Sistema visual unificado: soft, premium, clean, institucional, print-ready

import React from 'react';
import {
  Shield, ChevronRight, CheckCircle2, AlertCircle,
  Phone, GraduationCap, Brain, Building2, Users, Home,
  Award, Target,
} from 'lucide-react';
import { colors, fonts, fontSize, spacing, radius, shadows, a4, DocType, docAccents } from './DocTokens';
import { formatDateBR } from '../../utils/dateUtils';

// ─── QR Code placeholder ──────────────────────────────────────────────────────

export const DocQR: React.FC<{ code: string; size?: number }> = ({ code, size = 72 }) => {
  const hash = code.split('').reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0);
  const grid = Array.from({ length: 7 }, (_, r) =>
    Array.from({ length: 7 }, (_, col) => (Math.abs(hash ^ (r * 13 + col * 7)) % 3) !== 0)
  );
  const applyFinder = (g: boolean[][], r0: number, c0: number) => {
    for (let r = r0; r < r0 + 7 && r < 7; r++)
      for (let c = c0; c < c0 + 7 && c < 7; c++) {
        const dr = r - r0, dc = c - c0;
        g[r][c] = dr === 0 || dr === 6 || dc === 0 || dc === 6 || (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4);
      }
  };
  const g = grid.map(r => [...r]);
  applyFinder(g, 0, 0);
  const cell = size / 7;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ imageRendering: 'pixelated' }}>
      <rect width={size} height={size} fill="white" rx={4} />
      {g.flatMap((row, r) =>
        row.map((on, c) =>
          on ? <rect key={`${r}-${c}`} x={c * cell + 1} y={r * cell + 1}
            width={cell - 1} height={cell - 1} rx={1} fill={colors.dark} /> : null
        )
      )}
    </svg>
  );
};

// ─── Logo ─────────────────────────────────────────────────────────────────────

export const DocLogo: React.FC<{ size?: 'sm' | 'md' | 'lg'; inverted?: boolean }> = ({
  size = 'md', inverted = false,
}) => {
  const cfg = { sm: { icon: 28, text: 16, sub: 8 }, md: { icon: 38, text: 20, sub: 9 }, lg: { icon: 48, text: 26, sub: 10 } };
  const c = cfg[size];
  const textColor = inverted ? 'white' : colors.dark;
  const subColor  = inverted ? 'rgba(255,255,255,0.55)' : colors.gray;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
      <div style={{
        width: c.icon, height: c.icon, borderRadius: radius.md,
        background: `linear-gradient(135deg, ${colors.gold}, ${colors.goldM})`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Shield size={c.icon * 0.52} color="white" />
      </div>
      <div>
        <div style={{ fontFamily: fonts.body, fontWeight: 800, lineHeight: 1, letterSpacing: '-0.3px' }}>
          <span style={{ fontSize: c.text, color: textColor }}>Inclui</span>
          <span style={{ fontSize: c.text, color: colors.orange }}>AI</span>
        </div>
        <div style={{ fontSize: c.sub, color: subColor, marginTop: 2, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          Sistema de Educação Inclusiva
        </div>
      </div>
    </div>
  );
};

// ─── 1. DocumentHeader ────────────────────────────────────────────────────────
// Banner topo: identidade IncluiAI + tipo de documento + código

export interface DocumentHeaderProps {
  docType: DocType;
  docLabel?: string;
  docCode?: string;
  schoolName?: string;
  cityState?: string;
  date?: string;
  emittedBy?: string;
}

export const DocumentHeader: React.FC<DocumentHeaderProps> = ({
  docType, docLabel, docCode, schoolName, cityState, date, emittedBy,
}) => {
  const accent = docAccents[docType];
  const label  = docLabel ?? accent.label;
  const documentStatusLabel = docCode?.startsWith('VAL-')
    ? 'Documento Validado'
    : docCode?.startsWith('REG-')
      ? 'Documento Registrado'
      : 'Documento';
  return (
    <div style={{
      background: `linear-gradient(135deg, ${colors.petrol} 0%, ${colors.navy} 100%)`,
      padding: `${spacing['2xl']}px ${spacing['3xl']}px ${spacing.xl}px`,
      borderRadius: `${radius.xl}px ${radius.xl}px 0 0`,
    }}>
      {/* Linha superior: logo + badge tipo */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xl }}>
        <DocLogo size="md" inverted />
        <div style={{ textAlign: 'right' }}>
          <div style={{
            display: 'inline-block', fontSize: fontSize.xs, fontWeight: 800,
            padding: '3px 12px', borderRadius: radius.full,
            background: `${accent.main}40`, color: accent.main === colors.gold ? colors.gold : 'rgba(255,255,255,0.9)',
            border: `1px solid ${accent.main}60`,
            letterSpacing: '0.07em', textTransform: 'uppercase',
          }}>
            {label.toUpperCase()}
          </div>
          {docCode && (
            <p style={{ marginTop: 4, fontSize: fontSize['2xs'], fontFamily: fonts.mono, color: 'rgba(255,255,255,0.35)' }}>
              {docCode}
            </p>
          )}
        </div>
      </div>

      {/* Linha divisória dourada */}
      <div style={{ borderTop: `1px solid ${colors.gold}35`, paddingTop: spacing.xl }}>
        {schoolName && (
          <p style={{ fontSize: fontSize.xs, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.08em',
            textTransform: 'uppercase', marginBottom: 4 }}>
            {cityState ? `${schoolName} — ${cityState}` : schoolName}
          </p>
        )}
        <p style={{ fontSize: fontSize.xs, color: 'rgba(255,255,255,0.40)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
          {documentStatusLabel}
        </p>
        {/* Título do tipo de documento — slot para DocumentHero completar */}
        <div style={{ marginTop: 2, height: 3, width: 40, borderRadius: radius.full, background: colors.gold }} />
        {(date || emittedBy) && (
          <div style={{ display: 'flex', gap: spacing.lg, marginTop: spacing.md }}>
            {date && <span style={{ fontSize: fontSize.xs, color: 'rgba(255,255,255,0.45)' }}>Emissão: <strong style={{ color: 'rgba(255,255,255,0.75)' }}>{date}</strong></span>}
            {emittedBy && <span style={{ fontSize: fontSize.xs, color: 'rgba(255,255,255,0.45)' }}>Por: <strong style={{ color: 'rgba(255,255,255,0.75)' }}>{emittedBy}</strong></span>}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── 2. DocumentHero ──────────────────────────────────────────────────────────
// Bloco título do documento (logo do tipo, título grande, subtítulo)

export interface DocumentHeroProps {
  title: string;
  subtitle?: string;
  docType: DocType;
  badge?: string;
}

export const DocumentHero: React.FC<DocumentHeroProps> = ({ title, subtitle, docType, badge }) => {
  const accent = docAccents[docType];
  return (
    <div style={{
      padding: `${spacing.xl}px ${spacing['3xl']}px ${spacing.xl}px`,
      background: accent.light,
      borderBottom: `1px solid ${accent.main}20`,
    }}>
      {badge && (
        <span style={{
          display: 'inline-block', fontSize: fontSize.xs, fontWeight: 700,
          padding: '2px 10px', borderRadius: radius.full, marginBottom: spacing.sm,
          background: `${accent.main}15`, color: accent.main,
          border: `1px solid ${accent.main}30`, letterSpacing: '0.06em', textTransform: 'uppercase',
        }}>
          {badge}
        </span>
      )}
      <h1 style={{
        margin: 0, fontFamily: fonts.body, fontWeight: 800,
        fontSize: fontSize['2xl'], color: colors.dark, lineHeight: 1.2, letterSpacing: '-0.4px',
      }}>
        {title}
      </h1>
      {subtitle && (
        <p style={{ margin: `${spacing.sm}px 0 0`, fontSize: fontSize.md, color: colors.gray, lineHeight: 1.6 }}>
          {subtitle}
        </p>
      )}
      <div style={{ marginTop: spacing.md, height: 2, width: 32, borderRadius: radius.full, background: accent.main }} />
    </div>
  );
};

// ─── 3. DocumentCard ─────────────────────────────────────────────────────────
// Card com header colorido + corpo branco (padrão universal)

export interface DocumentCardProps {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  accentColor?: string;
  noPadding?: boolean;
  style?: React.CSSProperties;
}

export const DocumentCard: React.FC<DocumentCardProps> = ({
  title, icon, children, accentColor = colors.petrol, noPadding = false, style,
}) => (
  <div style={{
    borderRadius: radius.xl, overflow: 'hidden',
    border: `1px solid ${colors.border}`,
    boxShadow: shadows.card,
    marginBottom: spacing.xl,
    pageBreakInside: 'avoid',
    breakInside: 'avoid',
    ...style,
  }}>
    {/* Header */}
    <div style={{
      display: 'flex', alignItems: 'center', gap: spacing.md,
      padding: `${spacing.md}px ${spacing.lg}px`,
      background: accentColor, color: 'white',
    }}>
      {icon && <span style={{ display: 'flex', flexShrink: 0 }}>{icon}</span>}
      <span style={{
        fontFamily: fonts.body, fontWeight: 700, fontSize: fontSize.sm,
        letterSpacing: '0.06em', textTransform: 'uppercase',
      }}>
        {title}
      </span>
    </div>
    {/* Corpo */}
    <div style={{ background: colors.surface, padding: noPadding ? 0 : `${spacing.lg}px ${spacing.xl}px` }}>
      {children}
    </div>
  </div>
);

// ─── 4. DocumentSectionTitle ─────────────────────────────────────────────────
// Título de seção sem card — para separer blocos dentro de um documento

export interface DocumentSectionTitleProps {
  title: string;
  icon?: React.ReactNode;
  accentColor?: string;
  subtitle?: string;
}

export const DocumentSectionTitle: React.FC<DocumentSectionTitleProps> = ({
  title, icon, accentColor = colors.petrol, subtitle,
}) => (
  <div style={{ marginBottom: spacing.lg, paddingBottom: spacing.md, borderBottom: `2px solid ${accentColor}18` }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
      {icon && <span style={{ color: accentColor, display: 'flex' }}>{icon}</span>}
      <h2 style={{
        margin: 0, fontFamily: fonts.body, fontWeight: 800,
        fontSize: fontSize.base, color: accentColor,
        textTransform: 'uppercase', letterSpacing: '0.07em',
      }}>
        {title}
      </h2>
    </div>
    {subtitle && (
      <p style={{ margin: `${spacing.xs}px 0 0 ${icon ? spacing.md + 20 : 0}px`, fontSize: fontSize.sm, color: colors.gray }}>
        {subtitle}
      </p>
    )}
  </div>
);

// ─── 5. DocumentMetaGrid ─────────────────────────────────────────────────────
// Grade de campos chave-valor (dados do aluno, escola, etc.)

export interface MetaField {
  label: string;
  value?: string | null;
  icon?: React.ReactNode;
  span?: 1 | 2;
}

export interface DocumentMetaGridProps {
  fields: MetaField[];
  columns?: 2 | 3;
  accentColor?: string;
}

export const DocumentMetaGrid: React.FC<DocumentMetaGridProps> = ({
  fields, columns = 2, accentColor = colors.petrol,
}) => {
  const filtered = fields.filter(f => f.value);
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${columns}, 1fr)`,
      gap: '1px',
      background: colors.border,
      borderRadius: radius.lg,
      overflow: 'hidden',
      border: `1px solid ${colors.border}`,
    }}>
      {filtered.map((f, i) => (
        <div key={i} style={{
          background: colors.surface, padding: `${spacing.md}px ${spacing.lg}px`,
          display: 'flex', alignItems: 'flex-start', gap: spacing.sm,
          gridColumn: f.span === 2 ? 'span 2' : undefined,
        }}>
          {f.icon && (
            <div style={{
              width: 26, height: 26, borderRadius: radius.sm, flexShrink: 0,
              background: `${accentColor}12`, display: 'flex', alignItems: 'center',
              justifyContent: 'center', color: accentColor, marginTop: 1,
            }}>
              {f.icon}
            </div>
          )}
          <div style={{ minWidth: 0 }}>
            <p style={{
              margin: 0, fontSize: fontSize.xs, color: colors.gray2,
              textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 2,
            }}>
              {f.label}
            </p>
            <p style={{ margin: 0, fontSize: fontSize.sm, fontWeight: 600, color: colors.dark, lineHeight: 1.4 }}>
              {f.value}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
};

// ─── 6. DocumentChecklist ─────────────────────────────────────────────────────
// Checklist visual com status (presente/preservado + grau)

export interface ChecklistField {
  area: string;
  presente: boolean;
  grau?: 'leve' | 'moderado' | 'intenso';
  obs?: string;
}

export const DocumentChecklist: React.FC<{ items: ChecklistField[]; columns?: 1 | 2 }> = ({
  items, columns = 2,
}) => {
  const grauCfg = {
    leve:     { label: 'Leve',     bg: colors.amberL, border: colors.amber,   text: colors.amber   },
    moderado: { label: 'Moderado', bg: colors.redL,   border: colors.red,     text: colors.red     },
    intenso:  { label: 'Intenso',  bg: '#FEF2F2',     border: '#B91C1C',      text: '#B91C1C'      },
  };
  return (
    <div style={{ display: 'grid', gridTemplateColumns: columns === 2 ? '1fr 1fr' : '1fr', gap: spacing.sm }}>
      {items.map((item, i) => {
        const grau = item.grau ? grauCfg[item.grau] : null;
        return (
          <div key={i} style={{
            display: 'flex', alignItems: 'flex-start', gap: spacing.md,
            padding: spacing.md, borderRadius: radius.lg, border: '1px solid',
            background: item.presente ? (grau?.bg ?? colors.amberL) : colors.greenL,
            borderColor: item.presente ? (grau?.border ?? colors.amber) : colors.green,
          }}>
            {item.presente
              ? <AlertCircle size={14} style={{ color: grau?.text ?? colors.amber, marginTop: 1, flexShrink: 0 }} />
              : <CheckCircle2 size={14} style={{ color: colors.green, marginTop: 1, flexShrink: 0 }} />
            }
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
                <span style={{ fontSize: fontSize.xs, fontWeight: 700, color: colors.dark }}>{item.area}</span>
                {item.presente && grau && (
                  <span style={{
                    fontSize: fontSize['2xs'], fontWeight: 700, padding: '1px 7px',
                    borderRadius: radius.full, background: grau.border, color: 'white',
                  }}>{grau.label}</span>
                )}
                {!item.presente && (
                  <span style={{
                    fontSize: fontSize['2xs'], fontWeight: 700, padding: '1px 7px',
                    borderRadius: radius.full, background: colors.green, color: 'white',
                  }}>Preservado</span>
                )}
              </div>
              {item.obs && (
                <p style={{ margin: '2px 0 0', fontSize: fontSize['2xs'], color: colors.gray, lineHeight: 1.5 }}>
                  {item.obs}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ─── 7. DocumentChartBlock ────────────────────────────────────────────────────
// Container padronizado para gráficos/visualizações

export interface DocumentChartBlockProps {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  accentColor?: string;
  compact?: boolean;
}

export const DocumentChartBlock: React.FC<DocumentChartBlockProps> = ({
  title, subtitle, children, accentColor = colors.petrol, compact = false,
}) => (
  <div style={{
    borderRadius: radius.xl, border: `1px solid ${accentColor}20`,
    background: colors.surface, overflow: 'hidden',
    boxShadow: shadows.sm, marginBottom: spacing.xl,
    pageBreakInside: 'avoid', breakInside: 'avoid',
  }}>
    {title && (
      <div style={{
        padding: `${spacing.sm}px ${spacing.lg}px`,
        borderBottom: `1px solid ${accentColor}15`,
        background: `${accentColor}08`,
        display: 'flex', alignItems: 'center', gap: spacing.sm,
      }}>
        <div style={{ width: 3, height: 14, borderRadius: 2, background: accentColor, flexShrink: 0 }} />
        <div>
          <p style={{ margin: 0, fontSize: fontSize.xs, fontWeight: 700, color: accentColor,
            textTransform: 'uppercase', letterSpacing: '0.06em' }}>{title}</p>
          {subtitle && <p style={{ margin: 0, fontSize: fontSize['2xs'], color: colors.gray }}>{subtitle}</p>}
        </div>
      </div>
    )}
    <div style={{ padding: compact ? `${spacing.sm}px ${spacing.md}px` : `${spacing.lg}px ${spacing.xl}px` }}>
      {children}
    </div>
  </div>
);

// ─── 8. DocumentFooter ────────────────────────────────────────────────────────
// Rodapé institucional com QR + código de autenticidade

export interface DocumentFooterProps {
  docCode?: string;
  emittedBy?: string;
  date?: string;
  schoolName?: string;
  showQR?: boolean;
}

export const DocumentFooter: React.FC<DocumentFooterProps> = ({
  docCode, emittedBy, date, schoolName, showQR = true,
}) => (
  <div style={{
    display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
    flexWrap: 'wrap', gap: spacing.lg, marginTop: spacing.xl,
    padding: `${spacing.lg}px ${spacing.xl}px`,
    borderRadius: radius.xl, background: colors.bg, border: `1px solid ${colors.border}`,
  }}>
    {/* Info textual */}
    <div>
      <p style={{ margin: 0, fontSize: fontSize.sm, fontWeight: 700, color: colors.dark }}>
        Documento gerado pelo IncluiAI
      </p>
      <p style={{ margin: '2px 0 0', fontSize: fontSize.xs, color: colors.gray }}>www.incluiai.app.br</p>
      {schoolName && <p style={{ margin: '2px 0 0', fontSize: fontSize.xs, color: colors.gray }}>{schoolName}</p>}
      {date && <p style={{ margin: '2px 0 0', fontSize: fontSize.xs, color: colors.gray }}>Emissão: <strong style={{ color: colors.dark }}>{date}</strong></p>}
      {emittedBy && <p style={{ margin: '2px 0 0', fontSize: fontSize.xs, color: colors.gray }}>Profissional: <strong style={{ color: colors.dark }}>{emittedBy}</strong></p>}
      {docCode && (
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: spacing.sm,
          padding: '5px 10px', borderRadius: radius.md,
          background: colors.petrolL, border: `1px solid ${colors.petrol}25`,
        }}>
          <Shield size={10} color={colors.petrol} />
          <span style={{ fontSize: fontSize['2xs'], fontWeight: 700, color: colors.petrol, fontFamily: fonts.mono }}>
            {docCode.startsWith('VAL-') ? 'Código de Validação' : 'Código de Registro'} {docCode}
          </span>
        </div>
      )}
    </div>
    {/* QR + código */}
    {showQR && docCode && (
      <div style={{ textAlign: 'center' }}>
        <DocQR code={docCode} size={56} />
        <p style={{ margin: '4px 0 0', fontSize: fontSize['2xs'], color: colors.gray2 }}>Código de autenticidade</p>
      </div>
    )}
  </div>
);

// ─── 9. DocumentSignatureBlock ────────────────────────────────────────────────
// Bloco de assinaturas (1-4 assinantes)

export interface SignatureLine {
  label: string;
  name?: string;
  role?: string;
}

export interface DocumentSignatureBlockProps {
  signatures: SignatureLine[];
  title?: string;
  date?: string;
  location?: string;
}

export const DocumentSignatureBlock: React.FC<DocumentSignatureBlockProps> = ({
  signatures, title, date, location,
}) => (
  <div style={{
    marginTop: spacing.xl, padding: `${spacing.lg}px ${spacing.xl}px`,
    borderRadius: radius.xl, border: `1.5px dashed ${colors.border}`,
    background: colors.bg,
    pageBreakInside: 'avoid', breakInside: 'avoid',
  }}>
    {(title || date || location) && (
      <div style={{ marginBottom: spacing.xl, textAlign: 'center' }}>
        {title && <p style={{ margin: 0, fontSize: fontSize.sm, fontWeight: 700, color: colors.dark }}>{title}</p>}
        {(date || location) && (
          <p style={{ margin: '4px 0 0', fontSize: fontSize.xs, color: colors.gray }}>
            {[location, date].filter(Boolean).join(', ')}
          </p>
        )}
      </div>
    )}
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${Math.min(signatures.length, 3)}, 1fr)`,
      gap: spacing.xl,
    }}>
      {signatures.map((sig, i) => (
        <div key={i} style={{ textAlign: 'center' }}>
          {/* Linha para assinatura */}
          <div style={{ height: 40, borderBottom: `1.5px solid ${colors.gray}`, marginBottom: spacing.sm }} />
          <p style={{ margin: 0, fontSize: fontSize.sm, fontWeight: 700, color: colors.dark }}>
            {sig.name || '_________________________'}
          </p>
          {sig.role && <p style={{ margin: '2px 0 0', fontSize: fontSize.xs, color: colors.gray }}>{sig.role}</p>}
          <p style={{ margin: '2px 0 0', fontSize: fontSize.xs, color: colors.gray2 }}>{sig.label}</p>
        </div>
      ))}
    </div>
  </div>
);

// ─── DocumentItemList ─────────────────────────────────────────────────────────
// Lista de itens com chevron (estratégias, recomendações, metas)

export const DocumentItemList: React.FC<{
  items: string[];
  accentColor?: string;
  numbered?: boolean;
}> = ({ items, accentColor = colors.petrol, numbered = false }) => (
  <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
    {items.filter(Boolean).map((item, i) => (
      <li key={i} style={{
        display: 'flex', alignItems: 'flex-start', gap: spacing.sm,
        marginBottom: spacing.sm, fontSize: fontSize.base, color: colors.dark, lineHeight: 1.65,
      }}>
        {numbered
          ? <span style={{
              width: 20, height: 20, borderRadius: radius.full, flexShrink: 0,
              background: `${accentColor}15`, color: accentColor,
              fontWeight: 800, fontSize: fontSize.xs, display: 'flex',
              alignItems: 'center', justifyContent: 'center', marginTop: 1,
            }}>{i + 1}</span>
          : <ChevronRight size={13} style={{ color: accentColor, marginTop: 3, flexShrink: 0 }} />
        }
        <span>{item}</span>
      </li>
    ))}
  </ul>
);

// ─── DocumentHighlight ────────────────────────────────────────────────────────
// Bloco de destaque (conclusão técnica, parecer, aviso importante)

export const DocumentHighlight: React.FC<{
  children: React.ReactNode;
  variant?: 'petrol' | 'gold' | 'green' | 'red' | 'blue';
  icon?: React.ReactNode;
  title?: string;
}> = ({ children, variant = 'petrol', icon, title }) => {
  const variantMap = {
    petrol: { bg: colors.petrolL,  border: colors.petrol,  text: colors.petrol  },
    gold:   { bg: colors.goldL,    border: colors.gold,    text: colors.gold    },
    green:  { bg: colors.greenL,   border: colors.green,   text: colors.green   },
    red:    { bg: colors.redL,     border: colors.red,     text: colors.red     },
    blue:   { bg: colors.blueL,    border: colors.blue,    text: colors.blue    },
  };
  const v = variantMap[variant];
  return (
    <div style={{
      padding: `${spacing.lg}px ${spacing.xl}px`, borderRadius: radius.xl,
      background: v.bg, border: `2px solid ${v.border}30`,
      borderLeft: `4px solid ${v.border}`,
      marginBottom: spacing.xl,
      pageBreakInside: 'avoid', breakInside: 'avoid',
    }}>
      {title && (
        <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md }}>
          {icon && <span style={{ color: v.text, display: 'flex' }}>{icon}</span>}
          <span style={{ fontSize: fontSize.sm, fontWeight: 800, color: v.text,
            textTransform: 'uppercase', letterSpacing: '0.06em' }}>{title}</span>
        </div>
      )}
      <div style={{ fontSize: fontSize.base, color: colors.dark, lineHeight: 1.8 }}>{children}</div>
    </div>
  );
};

// ─── DocumentPage ─────────────────────────────────────────────────────────────
// Wrapper A4 — envolve todo o conteúdo imprimível

export const DocumentPage: React.FC<{
  children: React.ReactNode;
  id?: string;
  breakAfter?: boolean;
}> = ({ children, id, breakAfter = false }) => (
  <div
    id={id}
    data-doc-page="true"
    style={{
      width: a4.width,
      minHeight: a4.minHeight,
      margin: '0 auto',
      background: colors.surface,
      fontFamily: fonts.body,
      color: colors.dark,
      boxSizing: 'border-box',
      breakAfter: breakAfter ? 'page' : undefined,
      pageBreakAfter: breakAfter ? 'always' : undefined,
    }}
  >
    {children}
  </div>
);

// ─── DocumentRunningHeader ────────────────────────────────────────────────────
// Cabeçalho corrente para páginas internas (visível só na impressão)

export const DocumentRunningHeader: React.FC<{
  studentName: string;
  docType: DocType;
  code?: string;
}> = ({ studentName, docType, code }) => {
  const accent = docAccents[docType];
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      paddingBottom: spacing.md, marginBottom: spacing.lg,
      borderBottom: `2px solid ${accent.light}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
        <Shield size={11} color={colors.petrol} />
        <span style={{ fontSize: fontSize.xs, color: colors.petrol, fontWeight: 700 }}>IncluiAI</span>
        <span style={{ fontSize: fontSize.xs, color: colors.gray }}>/ {accent.label}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: spacing.lg }}>
        <span style={{ fontSize: fontSize.xs, fontWeight: 600, color: colors.dark }}>{studentName}</span>
        {code && <span style={{ fontSize: fontSize['2xs'], fontFamily: fonts.mono, color: colors.gray2 }}>{code}</span>}
      </div>
    </div>
  );
};

// ─── DocumentStudentBadge ─────────────────────────────────────────────────────
// Card de identificação do aluno (capa de qualquer documento)

export interface StudentBadgeData {
  name: string;
  birthDate?: string;
  grade?: string;
  shift?: string;
  diagnosis?: string;
  supportLevel?: string;
  schoolName?: string;
  guardianName?: string;
  guardianPhone?: string;
  city?: string;
  state?: string;
  score?: number; // média 0-5
}

export const DocumentStudentBadge: React.FC<{
  student: StudentBadgeData;
  accentColor?: string;
}> = ({ student, accentColor = colors.petrol }) => {
  const fields: MetaField[] = [
    { label: 'Série / Turno', value: [student.grade, student.shift].filter(Boolean).join(' · ') || null, icon: <GraduationCap size={12} /> },
    { label: 'Diagnóstico',   value: student.diagnosis || null, icon: <Brain size={12} /> },
    { label: 'Nível de Suporte', value: student.supportLevel || null, icon: <Award size={12} /> },
    { label: 'Escola', value: [student.schoolName, [student.city, student.state].filter(Boolean).join(' – ')].filter(Boolean).join(' — ') || null, icon: <Building2 size={12} /> },
    { label: 'Responsável', value: student.guardianName || null, icon: <Users size={12} /> },
    { label: 'Contato', value: student.guardianPhone || null, icon: <Phone size={12} /> },
  ];

  return (
    <div style={{
      borderRadius: radius['2xl'], overflow: 'hidden',
      border: `2px solid ${accentColor}`,
      boxShadow: shadows.lg, marginBottom: spacing.xl,
    }}>
      {/* Header do card */}
      <div style={{
        background: `linear-gradient(90deg, ${accentColor}12 0%, white 100%)`,
        padding: `${spacing.lg}px ${spacing.xl}px`,
        display: 'flex', alignItems: 'center', gap: spacing.lg,
      }}>
        {/* Avatar */}
        <div style={{
          width: 56, height: 56, borderRadius: radius.xl, flexShrink: 0,
          background: `linear-gradient(135deg, ${accentColor}, ${colors.navy})`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'white', fontWeight: 800, fontSize: fontSize.xl,
          boxShadow: `0 4px 12px ${accentColor}40`,
        }}>
          {student.name.trim().substring(0, 2).toUpperCase()}
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ margin: 0, fontSize: fontSize.xs, color: colors.gray,
            textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>
            Identificação do Aluno
          </p>
          <h2 style={{ margin: 0, fontSize: fontSize.xl, fontWeight: 800, color: colors.dark, lineHeight: 1.2 }}>
            {student.name}
          </h2>
          {student.birthDate && (
            <p style={{ margin: '3px 0 0', fontSize: fontSize.sm, color: colors.gray }}>
              Nascimento: {formatDateBR(student.birthDate)}
            </p>
          )}
        </div>
        {/* Score badge (se tiver) */}
        {student.score !== undefined && (
          <div style={{
            textAlign: 'center', padding: `${spacing.md}px ${spacing.lg}px`,
            borderRadius: radius.lg, background: `linear-gradient(135deg, ${accentColor}, ${colors.navy})`,
            color: 'white', flexShrink: 0,
          }}>
            <p style={{ margin: 0, fontSize: fontSize['2xs'], opacity: 0.7, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Média</p>
            <p style={{ margin: 0, fontSize: fontSize['2xl'], fontWeight: 800, lineHeight: 1 }}>
              {student.score.toFixed(1)}
            </p>
            <p style={{ margin: 0, fontSize: fontSize['2xs'], opacity: 0.6 }}>de 5,0</p>
          </div>
        )}
      </div>
      {/* Grid de campos */}
      <DocumentMetaGrid fields={fields} columns={2} accentColor={accentColor} />
    </div>
  );
};

// ─── Exports consolidados ─────────────────────────────────────────────────────

export { colors, fonts, fontSize, spacing, radius, shadows, a4, docAccents };
export type { DocType };
