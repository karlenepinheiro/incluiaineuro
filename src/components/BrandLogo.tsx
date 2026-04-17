import React from 'react';
import { Brain } from 'lucide-react';

// ─── Cores de marca ───────────────────────────────────────────────────────────
export const BRAND = {
  blue:   '#1F4E5F',   // "Inclui"  — azul institucional petrol
  orange: '#E07B2A',   // "AI"      — laranja tecnologia
};

interface BrandLogoProps {
  /** Tamanho da fonte do nome (default: 17) */
  fontSize?: number;
  /** Tamanho do ícone Brain (default: 17) */
  iconSize?: number;
  /** Tema claro exibe ícone branco sobre fundo azul; escuro exibe sobre fundo transparente */
  theme?: 'light' | 'dark' | 'white';
  /** Mostrar ícone (default: true) */
  showIcon?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Logotipo oficial IncluiAI.
 * "Inclui" em azul petrol (#1F4E5F) + "AI" em laranja (#E07B2A).
 * Usar em: navbar, LoginScreen, DashboardView, footer, PDFs.
 */
export const BrandLogo: React.FC<BrandLogoProps> = ({
  fontSize = 17,
  iconSize = 17,
  theme = 'light',
  showIcon = true,
  className,
  style,
}) => {
  const iconBg =
    theme === 'white'  ? 'rgba(255,255,255,0.15)' :
    theme === 'dark'   ? 'rgba(255,255,255,0.12)' :
    BRAND.blue;

  const iconColor = theme === 'light' ? 'white' : 'white';

  return (
    <div
      className={className}
      style={{ display: 'flex', alignItems: 'center', gap: 8, ...style }}
    >
      {showIcon && (
        <div style={{
          background: iconBg,
          padding: Math.round(iconSize * 0.41),
          borderRadius: Math.round(iconSize * 0.53),
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: theme !== 'light' ? '1px solid rgba(255,255,255,0.10)' : 'none',
          flexShrink: 0,
        }}>
          <Brain size={iconSize} color={iconColor} />
        </div>
      )}
      <span style={{
        fontSize,
        fontWeight: 800,
        letterSpacing: '-0.025em',
        lineHeight: 1,
        userSelect: 'none',
      }}>
        <span style={{ color: theme === 'white' || theme === 'dark' ? 'white' : BRAND.blue }}>
          Inclui
        </span>
        <span style={{ color: BRAND.orange }}>AI</span>
      </span>
    </div>
  );
};
