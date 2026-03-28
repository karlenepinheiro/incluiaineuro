/**
 * ExpiredPlanBanner.tsx
 * Banner global exibido quando a assinatura do usuário está vencida,
 * cancelada ou em período de cortesia expirado.
 *
 * Prioridade de links de pagamento:
 *   1. provider_payment_link / provider_update_payment_link do banco (Kiwify)
 *   2. Fallback: PaymentService (checkout genérico)
 */

import React, { useState } from 'react';
import { X, CreditCard, MessageCircle, RefreshCw, Clock, AlertTriangle } from 'lucide-react';
import type { SubscriptionStatus, TenantSummary, User } from '../types';
import type { ActiveSubscriptionInfo } from '../services/subscriptionService';
import { PaymentService } from '../services/paymentService';
import { PlanTier } from '../types';

interface ExpiredPlanBannerProps {
  subscriptionStatus: SubscriptionStatus;
  tenantSummary: TenantSummary | null;
  user: User;
  /** Assinatura com links diretos do gateway (Kiwify). Quando presente, priorizado. */
  subscription?: ActiveSubscriptionInfo | null;
  onDismiss?: () => void;
}

const STATUS_CONFIG: Record<string, {
  bg: string;
  border: string;
  accentText: string;
  icon: React.ReactNode;
  title: string;
  message: (renewalDate?: string) => string;
  showPayButton: boolean;
  showUpdatePayment: boolean;
  showSupport: boolean;
  dismissable: boolean;
}> = {
  OVERDUE: {
    bg: '#FFF8F0',
    border: '#F59E0B',
    accentText: '#92400E',
    icon: <AlertTriangle size={18} color="#F59E0B" />,
    title: 'Pagamento em atraso',
    message: (d) => d
      ? `Sua assinatura venceu em ${new Date(d).toLocaleDateString('pt-BR')}. Regularize para manter o acesso completo.`
      : 'Sua assinatura está com pagamento em atraso. Regularize para manter o acesso completo.',
    showPayButton: true,
    showUpdatePayment: true,
    showSupport: false,
    dismissable: true,
  },
  CANCELED: {
    bg: '#FFF5F5',
    border: '#EF4444',
    accentText: '#7F1D1D',
    icon: <span style={{ fontSize: 18 }}>🔒</span>,
    title: 'Assinatura cancelada',
    message: () => 'Sua assinatura foi cancelada. Para continuar usando os recursos premium, reative agora.',
    showPayButton: true,
    showUpdatePayment: false,
    showSupport: true,
    dismissable: false,
  },
  TRIAL: {
    bg: '#F0F9FF',
    border: '#3B82F6',
    accentText: '#1E3A5F',
    icon: <Clock size={18} color="#3B82F6" />,
    title: 'Período de avaliação',
    message: (d) => d
      ? `Seu período de avaliação termina em ${new Date(d).toLocaleDateString('pt-BR')}. Assine um plano para não perder o acesso.`
      : 'Seu período de avaliação está ativo. Assine um plano para não perder o acesso.',
    showPayButton: true,
    showUpdatePayment: false,
    showSupport: false,
    dismissable: true,
  },
  PENDING: {
    bg: '#FFFBEB',
    border: '#F59E0B',
    accentText: '#78350F',
    icon: <span style={{ fontSize: 18 }}>⏳</span>,
    title: 'Assinatura pendente',
    message: () => 'Seu pagamento ainda não foi confirmado. Assim que confirmado, seu acesso será liberado automaticamente.',
    showPayButton: false,
    showUpdatePayment: false,
    showSupport: true,
    dismissable: true,
  },
};

export const ExpiredPlanBanner: React.FC<ExpiredPlanBannerProps> = ({
  subscriptionStatus,
  tenantSummary,
  user,
  subscription,
  onDismiss,
}) => {
  const [dismissed, setDismissed] = useState(false);
  const [loadingCheckout, setLoadingCheckout] = useState(false);

  const config = STATUS_CONFIG[subscriptionStatus];
  if (!config || dismissed) return null;

  // Prioridade de data: DB subscription → tenantSummary
  const periodEnd = subscription?.currentPeriodEnd ?? subscription?.nextDueDate ?? tenantSummary?.renewalDatePlan ?? undefined;
  const currentPlan = tenantSummary?.planTier ?? user.plan;

  // --- Handlers de pagamento ---

  const handlePayNow = async () => {
    // 1. Link direto do gateway (Kiwify) — melhor opção
    if (subscription?.providerPaymentLink) {
      window.open(subscription.providerPaymentLink, '_blank', 'noopener,noreferrer');
      return;
    }

    // 2. Fallback: gerar checkout Kiwify
    setLoadingCheckout(true);
    try {
      const upgradePlan = currentPlan === PlanTier.FREE ? PlanTier.PRO : (currentPlan as PlanTier);
      const url = await PaymentService.getCheckoutUrl(upgradePlan, user);
      window.open(url, '_blank', 'noopener,noreferrer');
    } finally {
      setLoadingCheckout(false);
    }
  };

  const handleUpdatePayment = async () => {
    // 1. Link de atualização do gateway (Kiwify)
    if (subscription?.providerUpdatePaymentLink) {
      window.open(subscription.providerUpdatePaymentLink, '_blank', 'noopener,noreferrer');
      return;
    }

    // 2. Fallback: portal Kiwify
    const url = await PaymentService.manageSubscription(user.id);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleDismiss = () => {
    setDismissed(true);
    onDismiss?.();
  };

  return (
    <div
      style={{
        background: config.bg,
        borderBottom: `3px solid ${config.border}`,
        padding: '10px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        flexWrap: 'wrap',
        position: 'relative',
        zIndex: 50,
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
      }}
      role="alert"
      aria-live="polite"
    >
      {/* Ícone */}
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
        {config.icon}
      </div>

      {/* Texto */}
      <div style={{ flex: 1, minWidth: 180 }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: config.accentText, marginRight: 6 }}>
          {config.title}
        </span>
        <span style={{ fontSize: 12, color: '#6B7280' }}>
          {config.message(periodEnd)}
        </span>
      </div>

      {/* Status + vencimento */}
      {periodEnd && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            background: 'rgba(0,0,0,0.04)',
            borderRadius: 8,
            padding: '3px 10px',
            fontSize: 11,
            color: '#6B7280',
            fontWeight: 500,
            flexShrink: 0,
            whiteSpace: 'nowrap',
          }}
        >
          <Clock size={11} />
          {subscriptionStatus === 'TRIAL' ? 'Expira: ' : 'Vencido: '}
          <strong style={{ color: config.accentText }}>
            {new Date(periodEnd).toLocaleDateString('pt-BR')}
          </strong>
        </div>
      )}

      {/* Ações */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        {config.showPayButton && (
          <button
            onClick={handlePayNow}
            disabled={loadingCheckout}
            style={{
              background: config.border,
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '6px 14px',
              fontSize: 12,
              fontWeight: 700,
              cursor: loadingCheckout ? 'wait' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              whiteSpace: 'nowrap',
            }}
          >
            {loadingCheckout ? (
              <RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} />
            ) : (
              <CreditCard size={12} />
            )}
            {subscriptionStatus === 'CANCELED' ? 'Reativar agora' : 'Pagar agora'}
          </button>
        )}

        {config.showUpdatePayment && (
          <button
            onClick={handleUpdatePayment}
            style={{
              background: 'transparent',
              color: config.border,
              border: `1.5px solid ${config.border}`,
              borderRadius: 8,
              padding: '5px 12px',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            Atualizar cartão
          </button>
        )}

        {config.showSupport && (
          <a
            href="https://wa.me/5511999999999?text=Preciso+de+ajuda+com+minha+assinatura+IncluiAI"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              background: 'transparent',
              color: '#6B7280',
              border: '1.5px solid #D1D5DB',
              borderRadius: 8,
              padding: '5px 12px',
              fontSize: 12,
              fontWeight: 500,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              textDecoration: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            <MessageCircle size={12} />
            Suporte
          </a>
        )}

        {config.dismissable && (
          <button
            onClick={handleDismiss}
            aria-label="Fechar aviso"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: '#9CA3AF',
              padding: 4,
              borderRadius: 4,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <X size={15} />
          </button>
        )}
      </div>
    </div>
  );
};
