/**
 * creditReservationFlow.ts — Sprint 2B
 *
 * Helper genérico RESERVE → work() → COMMIT (sucesso) | RELEASE (falha).
 * Reutiliza EXCLUSIVAMENTE as RPCs atômicas já existentes via
 * `CreditTransactionService` (src/services/creditService.ts) — nenhuma RPC
 * financeira nova, nenhuma alteração de wallet/ledger/preço.
 *
 * Espelha o padrão já usado em src/views/IncluiLabView.tsx (`runReservedCreditFlow`,
 * usado hoje pelos modos A4 Visual / A4 Premium / Adaptar Visual / Adaptar Premium)
 * como módulo importável pelo Activity Pipeline canônico, sem alterar o arquivo original.
 */
import { CreditTransactionService } from '../creditService';
import type { User } from '../../types';

function notifyCreditsChanged(userId: string) {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  window.dispatchEvent(new CustomEvent('incluiai:credits-changed', { detail: { userId } }));
}

export interface RunReservedCreditFlowParams<T> {
  user: User;
  amount: number;
  actionKey: string;
  description: string;
  metadata?: Record<string, unknown>;
  work: (reservationId: string, operationId: string) => Promise<T>;
}

export async function runReservedCreditFlow<T>(params: RunReservedCreditFlowParams<T>): Promise<T> {
  const tenantId = (params.user as any).tenant_id;
  const userId = (params.user as any).id ?? null;
  const operationId = CreditTransactionService.createOperationId(params.actionKey);

  const reserve = await CreditTransactionService.atomicReserveCredits({
    tenantId,
    amount: params.amount,
    description: params.description,
    userId,
    operationId,
    metadata: params.metadata ?? {},
    source: 'incluilab_canonical.reserve',
  });

  const reservationId = reserve.reservation_id;
  if (!reservationId) throw new Error('Falha ao reservar créditos para a operação.');

  try {
    const result = await params.work(reservationId, operationId);
    await CreditTransactionService.atomicCommitReservedCredits({
      tenantId,
      reservationId,
      description: params.description,
      userId,
      operationId: `${operationId}:commit`,
      metadata: params.metadata ?? {},
      source: 'incluilab_canonical.commit',
    });
    notifyCreditsChanged(params.user.id);
    return result;
  } catch (error) {
    try {
      await CreditTransactionService.atomicReleaseReservedCredits({
        tenantId,
        reservationId,
        description: `Falha em ${params.description}`,
        userId,
        operationId: `${operationId}:release`,
        metadata: {
          ...(params.metadata ?? {}),
          failure_kind: 'canonical_pipeline_failed',
          error_message: error instanceof Error ? error.message : String(error),
        },
        source: 'incluilab_canonical.release',
      });
      notifyCreditsChanged(params.user.id);
    } catch (releaseError) {
      console.error('[IncluiLAB Canonical] Falha ao liberar reserva de créditos:', releaseError);
    }
    throw error;
  }
}
