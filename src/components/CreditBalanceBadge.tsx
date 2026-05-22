import React from 'react';
import { ArrowRight, Coins, History, RefreshCw, ShoppingCart, Wallet } from 'lucide-react';

const palette = {
  surface: '#FFFFFF',
  bg: '#F8FAFC',
  border: '#E7E2D8',
  text: '#2E3A59',
  textMuted: '#667085',
  accent: '#1F4E5F',
  accentSoft: '#EFF6FF',
  success: '#15803D',
  warning: '#D97706',
};

function formatDateBR(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toLocaleDateString('pt-BR');
}

function safeNumber(value?: number | null) {
  return Number.isFinite(value as number) ? Math.max(0, Number(value)) : 0;
}

function renewalDayLabel(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date.getDate();
}

interface CreditBalanceBadgeProps {
  balance: number;
  planCreditsMonthly?: number;
  consumedThisCycle?: number;
  purchasedCreditsHistory?: number;
  extraCreditsAvailable?: number | null;
  resetAt?: string | null;
  compact?: boolean;
  onClick?: () => void;
}

const BreakdownRow: React.FC<{
  icon: React.ElementType;
  label: string;
  value: number | string;
  tone?: string;
}> = ({ icon: Icon, label, value, tone = palette.text }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
      <div style={{
        width: 24,
        height: 24,
        borderRadius: 8,
        background: palette.bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}>
        <Icon size={13} color={tone} />
      </div>
      <span style={{ fontSize: 12, color: palette.textMuted }}>{label}</span>
    </div>
    <strong style={{ fontSize: 12, color: tone, whiteSpace: 'nowrap' }}>{value}</strong>
  </div>
);

export const CreditBalanceBadge: React.FC<CreditBalanceBadgeProps> = ({
  balance,
  planCreditsMonthly = 0,
  consumedThisCycle = 0,
  purchasedCreditsHistory = 0,
  extraCreditsAvailable,
  resetAt,
  compact = false,
  onClick,
}) => {
  const availableBalance = safeNumber(balance);
  const cycleCredits = safeNumber(planCreditsMonthly);
  const consumedCredits = safeNumber(consumedThisCycle);
  const purchasedHistory = safeNumber(purchasedCreditsHistory);
  const extraAvailable =
    typeof extraCreditsAvailable === 'number' && Number.isFinite(extraCreditsAvailable)
      ? Math.max(0, Number(extraCreditsAvailable))
      : null;
  const resetLabel = formatDateBR(resetAt);
  const renewalDay = renewalDayLabel(resetAt);

  if (compact) {
    const Comp = onClick ? 'button' : 'div';
    return (
      <Comp
        {...(onClick ? { onClick, type: 'button' as const, title: 'Ver créditos' } : {})}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 10,
          padding: '8px 12px',
          borderRadius: 14,
          border: `1px solid ${palette.border}`,
          background: palette.surface,
          cursor: onClick ? 'pointer' : 'default',
          boxShadow: '0 1px 4px rgba(15, 23, 42, 0.04)',
        }}
      >
        <div style={{
          width: 30,
          height: 30,
          borderRadius: 10,
          background: palette.accentSoft,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}>
          <Wallet size={16} color={palette.accent} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: palette.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Saldo disponível
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <strong style={{ fontSize: 16, lineHeight: 1, color: palette.accent }}>{availableBalance} créditos</strong>
            {onClick && <ArrowRight size={13} color={palette.textMuted} />}
          </div>
        </div>
      </Comp>
    );
  }

  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp
      {...(onClick ? { onClick, type: 'button' as const, title: 'Ver créditos' } : {})}
      style={{
        width: '100%',
        textAlign: 'left',
        borderRadius: 18,
        border: `1px solid ${palette.border}`,
        background: palette.surface,
        padding: 20,
        cursor: onClick ? 'pointer' : 'default',
        boxShadow: '0 8px 24px rgba(15, 23, 42, 0.06)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: palette.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
            Créditos IA
          </div>
          <div style={{ fontSize: 13, color: palette.textMuted, marginBottom: 4 }}>
            Saldo disponível
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <strong style={{ fontSize: 34, lineHeight: 1, color: palette.accent }}>{availableBalance}</strong>
            <span style={{ fontSize: 13, fontWeight: 700, color: palette.textMuted }}>créditos</span>
          </div>
          {resetLabel && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 12, color: palette.textMuted }}>
              <RefreshCw size={13} />
              Próxima renovação dos créditos em {resetLabel}
            </div>
          )}
          {renewalDay && (
            <div style={{ marginTop: 6, fontSize: 12, color: palette.textMuted }}>
              Créditos renovam todo mês no dia {renewalDay}.
            </div>
          )}
        </div>
        <div style={{
          width: 46,
          height: 46,
          borderRadius: 14,
          background: palette.accentSoft,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}>
          <Coins size={22} color={palette.accent} />
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 10,
        paddingTop: 16,
        borderTop: `1px solid ${palette.border}`,
      }}>
        <BreakdownRow
          icon={Wallet}
          label="Créditos do ciclo atual"
          value={cycleCredits}
        />
        <BreakdownRow
          icon={Coins}
          label="Créditos extras disponíveis"
          value={extraAvailable === null ? '—' : extraAvailable}
          tone={extraAvailable === null ? palette.textMuted : palette.success}
        />
        <BreakdownRow
          icon={RefreshCw}
          label="Consumidos neste ciclo"
          value={consumedCredits}
          tone={palette.warning}
        />
        <BreakdownRow
          icon={ShoppingCart}
          label="Histórico total comprado"
          value={purchasedHistory}
          tone={palette.success}
        />
      </div>
    </Comp>
  );
};

export default CreditBalanceBadge;
