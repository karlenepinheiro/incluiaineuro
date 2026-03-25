/**
 * SubscriptionStatusBadge.tsx
 * Badge reutilizável para exibir o status de uma assinatura.
 */

import React from 'react';
import type { SubscriptionStatus } from '../types';

interface SubscriptionStatusBadgeProps {
  status: SubscriptionStatus;
  size?: 'sm' | 'md';
  showLabel?: boolean;
}

const STATUS_MAP: Record<SubscriptionStatus, {
  label: string;
  bg: string;
  color: string;
  dot: string;
}> = {
  ACTIVE:        { label: 'Ativo',         bg: '#D1FAE5', color: '#065F46', dot: '#10B981' },
  PENDING:       { label: 'Pendente',      bg: '#FEF3C7', color: '#92400E', dot: '#F59E0B' },
  OVERDUE:       { label: 'Em atraso',     bg: '#FEE2E2', color: '#991B1B', dot: '#EF4444' },
  CANCELED:      { label: 'Cancelado',     bg: '#F3F4F6', color: '#374151', dot: '#9CA3AF' },
  TRIAL:         { label: 'Trial',         bg: '#DBEAFE', color: '#1E40AF', dot: '#3B82F6' },
  COURTESY:      { label: 'Cortesia',      bg: '#EDE9FE', color: '#5B21B6', dot: '#8B5CF6' },
  INTERNAL_TEST: { label: 'Teste interno', bg: '#F0FDF4', color: '#166534', dot: '#22C55E' },
};

export const SubscriptionStatusBadge: React.FC<SubscriptionStatusBadgeProps> = ({
  status,
  size = 'md',
  showLabel = true,
}) => {
  const cfg = STATUS_MAP[status] ?? STATUS_MAP.PENDING;
  const fontSize = size === 'sm' ? 11 : 12;
  const padding = size === 'sm' ? '2px 8px' : '3px 10px';

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        background: cfg.bg,
        color: cfg.color,
        borderRadius: 999,
        padding,
        fontSize,
        fontWeight: 700,
        letterSpacing: '0.02em',
        whiteSpace: 'nowrap',
      }}
    >
      <span
        style={{
          width: size === 'sm' ? 6 : 7,
          height: size === 'sm' ? 6 : 7,
          borderRadius: '50%',
          background: cfg.dot,
          flexShrink: 0,
        }}
      />
      {showLabel && cfg.label}
    </span>
  );
};
