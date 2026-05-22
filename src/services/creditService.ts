/**
 * creditService.ts
 * Camada de leitura do ledger/carteira e wrappers das RPCs atômicas.
 */

import { supabase } from './supabase';
import type { CreditLedgerEntry, CreditLedgerType, AdminGrant, AdminGrantType } from '../types';

type GrantLedgerType = 'monthly_grant' | 'manual_grant' | 'purchase_extra' | 'courtesy';

export type CreditRpcResult = {
  ok: boolean;
  reason?: string;
  status?: string;
  operation_id?: string;
  reservation_id?: string;
  final_balance?: number;
  current_balance?: number;
  requested_amount?: number;
  attempt_count?: number;
  idempotent?: boolean;
};

function buildOperationId(prefix: string): string {
  const safePrefix = prefix.replace(/[^a-zA-Z0-9:_-]/g, '_').slice(0, 48) || 'credit';
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${safePrefix}:${crypto.randomUUID()}`;
  }
  return `${safePrefix}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 10)}`;
}

async function callCreditRpc<T extends CreditRpcResult>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw error;

  const result = (data ?? null) as T | null;
  if (!result) throw new Error(`RPC ${fn} retornou resposta vazia.`);

  if (!result.ok) {
    if (result.reason === 'insufficient_credits') {
      const balance = Number(result.current_balance ?? 0);
      const required = Number(result.requested_amount ?? 0);
      throw new Error(`INSUFFICIENT_CREDITS:${balance}:${required}`);
    }
    throw new Error(result.reason || `RPC ${fn} falhou.`);
  }

  return result;
}

export const CreditTransactionService = {
  createOperationId(prefix = 'credit'): string {
    return buildOperationId(prefix);
  },

  async atomicDebitCredits(params: {
    tenantId: string;
    amount: number;
    description: string;
    userId?: string | null;
    metadata?: Record<string, unknown>;
    operationId?: string;
    source?: string;
  }): Promise<CreditRpcResult> {
    return callCreditRpc('atomic_debit_credits', {
      p_operation_id: params.operationId ?? buildOperationId('debit'),
      p_amount: params.amount,
      p_description: params.description,
      p_tenant_id: params.tenantId,
      p_user_id: params.userId ?? null,
      p_metadata: params.metadata ?? {},
      p_ledger_type: 'usage_ai',
      p_source: params.source ?? 'frontend_credit_service',
    });
  },

  async atomicGrantCredits(params: {
    tenantId: string;
    amount: number;
    description: string;
    ledgerType?: GrantLedgerType;
    userId?: string | null;
    metadata?: Record<string, unknown>;
    operationId?: string;
    source?: string;
  }): Promise<CreditRpcResult> {
    return callCreditRpc('atomic_grant_credits', {
      p_operation_id: params.operationId ?? buildOperationId('grant'),
      p_amount: params.amount,
      p_description: params.description,
      p_tenant_id: params.tenantId,
      p_user_id: params.userId ?? null,
      p_metadata: params.metadata ?? {},
      p_ledger_type: params.ledgerType ?? 'manual_grant',
      p_source: params.source ?? 'frontend_credit_service',
    });
  },

  async atomicRefundCredits(params: {
    tenantId: string;
    amount: number;
    description: string;
    userId?: string | null;
    metadata?: Record<string, unknown>;
    operationId?: string;
    source?: string;
  }): Promise<CreditRpcResult> {
    return callCreditRpc('atomic_refund_credits', {
      p_operation_id: params.operationId ?? buildOperationId('refund'),
      p_amount: params.amount,
      p_description: params.description,
      p_tenant_id: params.tenantId,
      p_user_id: params.userId ?? null,
      p_metadata: params.metadata ?? {},
      p_source: params.source ?? 'frontend_credit_service',
    });
  },

  async atomicReserveCredits(params: {
    tenantId: string;
    amount: number;
    description: string;
    userId?: string | null;
    metadata?: Record<string, unknown>;
    operationId?: string;
    expiresAt?: string | null;
    source?: string;
  }): Promise<CreditRpcResult> {
    return callCreditRpc('atomic_reserve_credits', {
      p_operation_id: params.operationId ?? buildOperationId('reserve'),
      p_amount: params.amount,
      p_description: params.description,
      p_tenant_id: params.tenantId,
      p_user_id: params.userId ?? null,
      p_metadata: params.metadata ?? {},
      p_expires_at: params.expiresAt ?? null,
      p_source: params.source ?? 'frontend_credit_service',
    });
  },

  async atomicCommitReservedCredits(params: {
    tenantId: string;
    reservationId: string;
    description?: string;
    userId?: string | null;
    metadata?: Record<string, unknown>;
    operationId?: string;
    source?: string;
  }): Promise<CreditRpcResult> {
    return callCreditRpc('atomic_commit_reserved_credits', {
      p_operation_id: params.operationId ?? buildOperationId('commit'),
      p_reservation_id: params.reservationId,
      p_description: params.description ?? null,
      p_tenant_id: params.tenantId,
      p_user_id: params.userId ?? null,
      p_metadata: params.metadata ?? {},
      p_final_ledger_type: 'usage_ai',
      p_source: params.source ?? 'frontend_credit_service',
    });
  },

  async atomicReleaseReservedCredits(params: {
    tenantId: string;
    reservationId: string;
    description?: string;
    userId?: string | null;
    metadata?: Record<string, unknown>;
    operationId?: string;
    source?: string;
  }): Promise<CreditRpcResult> {
    return callCreditRpc('atomic_release_reserved_credits', {
      p_operation_id: params.operationId ?? buildOperationId('release'),
      p_reservation_id: params.reservationId,
      p_description: params.description ?? null,
      p_tenant_id: params.tenantId,
      p_user_id: params.userId ?? null,
      p_metadata: params.metadata ?? {},
      p_source: params.source ?? 'frontend_credit_service',
    });
  },
};

// ---------------------------------------------------------------------------
// CARTEIRA
// ---------------------------------------------------------------------------

export const CreditWalletService = {
  async getBalance(tenantId: string): Promise<number> {
    const { data, error } = await supabase
      .from('credits_wallet')
      .select('balance')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (error) throw error;
    return Number(data?.balance ?? 0);
  },

  async getSummary(tenantId: string): Promise<{
    balance: number;
    total_earned: number;
    total_spent: number;
    reset_at: string | null;
  }> {
    const { data, error } = await supabase
      .from('credits_wallet')
      .select('balance, last_reset_at')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (error) throw error;

    return {
      balance: Number(data?.balance ?? 0),
      total_earned: 0,
      total_spent: 0,
      reset_at: (data as any)?.last_reset_at ?? null,
    };
  },
};

// ---------------------------------------------------------------------------
// LEDGER
// ---------------------------------------------------------------------------

export function isFreeBootstrapEntry(entry: CreditLedgerEntry): boolean {
  if (entry.source === 'free_bootstrap') return true;
  const desc = (entry.description ?? '').toLowerCase();
  return entry.amount > 0 && entry.amount <= 60 && desc.includes('iniciais') && desc.includes('free');
}

export const CreditLedgerService = {
  async getHistory(
    tenantId: string,
    limit = 50,
    options?: { excludeFreeBootstrap?: boolean },
  ): Promise<CreditLedgerEntry[]> {
    const { data, error } = await supabase
      .from('credits_ledger')
      .select('id, tenant_id, user_id, type, operation, source, amount, description, created_at, operation_id')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    const entries = (data ?? []).map(mapLedgerEntry);
    return options?.excludeFreeBootstrap ? entries.filter(e => !isFreeBootstrapEntry(e)) : entries;
  },

  async getGlobalHistory(limit = 100): Promise<CreditLedgerEntry[]> {
    const { data, error } = await supabase
      .from('credits_ledger')
      .select('id, tenant_id, user_id, type, operation, source, amount, description, created_at, operation_id')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return (data ?? []).map(mapLedgerEntry);
  },

  async addCredits(params: {
    tenantId: string;
    amount: number;
    type: CreditLedgerType;
    description: string;
    referenceType?: string;
    referenceId?: string;
    createdBy?: string;
    createdByName?: string;
  }): Promise<void> {
    if (params.amount <= 0) throw new Error('O valor de créditos deve ser positivo.');

    await CreditTransactionService.atomicGrantCredits({
      tenantId: params.tenantId,
      amount: params.amount,
      description: params.description,
      ledgerType: (params.type as GrantLedgerType) ?? 'manual_grant',
      userId: params.createdBy ?? null,
      operationId: params.referenceId || undefined,
      metadata: {
        reference_type: params.referenceType ?? null,
        reference_id: params.referenceId ?? null,
        created_by_name: params.createdByName ?? null,
      },
      source: 'credit_service.addCredits',
    });
  },

  async deductCredits(params: {
    tenantId: string;
    amount: number;
    type: CreditLedgerType;
    description: string;
    referenceType?: string;
    referenceId?: string;
    createdBy?: string;
  }): Promise<void> {
    if (params.amount <= 0) throw new Error('O valor de créditos deve ser positivo.');

    await CreditTransactionService.atomicDebitCredits({
      tenantId: params.tenantId,
      amount: params.amount,
      description: params.description,
      userId: params.createdBy ?? null,
      operationId: params.referenceId || undefined,
      metadata: {
        ledger_type: params.type,
        reference_type: params.referenceType ?? null,
        reference_id: params.referenceId ?? null,
      },
      source: 'credit_service.deductCredits',
    });
  },
};

// ---------------------------------------------------------------------------
// ADMIN GRANTS
// ---------------------------------------------------------------------------

export const AdminGrantService = {
  async getForTenant(_tenantId: string): Promise<AdminGrant[]> {
    return [];
  },

  async getAll(_limit = 100): Promise<AdminGrant[]> {
    return [];
  },

  async grantCredits(params: {
    tenantId: string;
    amount: number;
    reason: string;
    grantedByName: string;
    grantedById?: string;
  }): Promise<void> {
    if (params.amount === 0) throw new Error('Quantidade inválida.');

    const isRefund = params.amount < 0;
    const absAmount = Math.abs(params.amount);
    const description = isRefund
      ? `Estorno de ${absAmount} créditos — ${params.reason}`
      : `Bônus de ${absAmount} créditos — ${params.reason}`;

    if (isRefund) {
      await CreditTransactionService.atomicRefundCredits({
        tenantId: params.tenantId,
        amount: absAmount,
        description,
        userId: params.grantedById ?? null,
        metadata: {
          reason: params.reason,
          granted_by_name: params.grantedByName,
        },
        source: 'admin_grant_service.refund',
      });
      return;
    }

    await CreditTransactionService.atomicGrantCredits({
      tenantId: params.tenantId,
      amount: absAmount,
      description,
      ledgerType: 'manual_grant',
      userId: params.grantedById ?? null,
      metadata: {
        reason: params.reason,
        granted_by_name: params.grantedByName,
      },
      source: 'admin_grant_service.grant',
    });
  },

  async logGrant(_params: {
    tenantId: string;
    grantType: AdminGrantType;
    value: string;
    reason: string;
    grantedById?: string;
    grantedByName?: string;
  }): Promise<void> {
    // tabela admin_grants não existe no schema atual
  },
};

// ---------------------------------------------------------------------------
// MAPPERS
// ---------------------------------------------------------------------------

function mapLedgerEntry(row: any): CreditLedgerEntry {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    type: row.type,
    operation: row.operation ?? undefined,
    amount: Number(row.amount),
    description: row.description,
    source: row.source ?? undefined,
    reference_type: row.reference_type,
    reference_id: row.reference_id,
    created_by: row.created_by,
    created_by_name: row.created_by_name,
    created_at: row.created_at,
  };
}

function mapGrant(row: any): AdminGrant {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    grant_type: row.grant_type,
    value: row.value,
    reason: row.reason,
    granted_by: row.granted_by,
    granted_by_name: row.granted_by_name,
    created_at: row.created_at,
  };
}

void mapGrant;
