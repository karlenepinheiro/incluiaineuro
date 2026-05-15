import React from 'react';

export type AlertKind =
  | 'none'
  | 'divergence'
  | 'plan_mismatch'
  | 'no_owner'
  | 'wallet_mismatch'
  | 'pending_activation'
  | 'pending_account';

interface Props {
  kind: AlertKind;
  compact?: boolean;
}

const LABEL: Record<AlertKind, string> = {
  none:               '',
  divergence:         'Divergência',
  plan_mismatch:      'Plano divergente',
  no_owner:           'Sem owner',
  wallet_mismatch:    'Sem wallet',
  pending_activation: 'Ativação pendente',
  pending_account:    'Sem conta',
};

const STYLE: Record<AlertKind, string> = {
  none:               '',
  divergence:         'bg-red-50 text-red-600 border-red-200',
  plan_mismatch:      'bg-orange-50 text-orange-700 border-orange-200',
  no_owner:           'bg-red-50 text-red-600 border-red-200',
  wallet_mismatch:    'bg-amber-50 text-amber-700 border-amber-200',
  pending_activation: 'bg-amber-50 text-amber-700 border-amber-200',
  pending_account:    'bg-orange-50 text-orange-700 border-orange-200',
};

export const ActivationAlertBadge: React.FC<Props> = ({ kind, compact = false }) => {
  if (kind === 'none') return null;
  return (
    <span
      className={`inline-flex items-center border rounded font-semibold leading-none
        ${compact ? 'text-[8px] px-1 py-0.5' : 'text-[10px] px-1.5 py-0.5'}
        ${STYLE[kind]}`}
    >
      {LABEL[kind]}
    </span>
  );
};
