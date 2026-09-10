import React from 'react';
import type { SubscriptionStatus } from '../types';
import type { CommercialAccess } from '../services/subscriptionAccess';
import { SubscriptionStatusBadge } from './SubscriptionStatusBadge';

export function SubscriptionFinanceStatus({ access, status, planName }: {
  access: CommercialAccess; status: SubscriptionStatus; planName: string;
}) {
  const date = access.validUntil && Number.isFinite(Date.parse(access.validUntil))
    ? new Date(access.validUntil).toLocaleDateString('pt-BR') : null;
  return <>
    <div className="flex items-center justify-between mb-3">
      <span className="text-xs uppercase font-extrabold text-gray-500">Status</span>
      {access.isInternal ? <span className="text-xs font-bold text-brand-700">Conta interna / teste</span>
        : access.reason === 'expired' ? <span className="text-xs font-bold text-red-600">Expirado</span>
        : <SubscriptionStatusBadge status={status} size="sm" />}
    </div>
    <div className="text-2xl font-extrabold text-gray-900">{planName}</div>
    <p className="text-xs mt-1 font-semibold text-gray-500">
      {access.isInternal ? 'Uso interno — sem cobrança recorrente'
        : date ? `${access.allowed ? 'Plano válido até' : 'Fim do período'}: ${date}`
        : 'Sem data de vencimento'}
    </p>
  </>;
}
