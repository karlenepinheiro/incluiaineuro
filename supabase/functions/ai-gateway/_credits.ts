/**
 * _credits.ts
 * Operações financeiras autoritativas do ai-gateway usando RPCs atômicas.
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export interface TenantContext {
  tenantId: string;
  userId: string;
}

export interface WalletState {
  walletId: string;
  balance: number;
}

export interface CreditReservationResult {
  operationId: string;
  reservationId: string;
  finalBalance: number;
  idempotent: boolean;
}

export async function getTenantContext(
  adminDb: SupabaseClient,
  uid: string,
): Promise<TenantContext> {
  const { data, error } = await adminDb
    .from('users')
    .select('id, tenant_id')
    .eq('id', uid)
    .single();

  if (error || !data?.tenant_id) {
    throw new Error(`TENANT_NOT_FOUND: uid=${uid}`);
  }

  return { tenantId: data.tenant_id as string, userId: data.id as string };
}

export async function getWallet(
  adminDb: SupabaseClient,
  tenantId: string,
): Promise<WalletState | null> {
  const { data, error } = await adminDb
    .from('credits_wallet')
    .select('id, balance')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (error) {
    console.warn('[_credits] getWallet error:', error.message);
    return null;
  }

  if (!data) return null;
  return { walletId: data.id as string, balance: Number(data.balance ?? 0) };
}

export async function checkCredits(
  adminDb: SupabaseClient,
  tenantId: string,
  required: number,
): Promise<WalletState | null> {
  if (required <= 0) return null;

  const wallet = await getWallet(adminDb, tenantId);
  if (!wallet) {
    console.warn('[_credits] Wallet nao encontrada para tenant', tenantId, '- operacao permitida');
    return null;
  }

  if (wallet.balance < required) {
    throw new Error(`INSUFFICIENT_CREDITS:${wallet.balance}:${required}`);
  }

  return wallet;
}

type RpcCreditResult = {
  ok: boolean;
  reason?: string;
  operation_id?: string;
  reservation_id?: string;
  final_balance?: number;
  current_balance?: number;
  requested_amount?: number;
  idempotent?: boolean;
};

async function callCreditRpc(
  adminDb: SupabaseClient,
  fn: string,
  payload: Record<string, unknown>,
): Promise<RpcCreditResult> {
  const { data, error } = await adminDb.rpc(fn, payload);
  if (error) throw new Error(`${fn}:${error.message}`);

  const result = (data ?? null) as RpcCreditResult | null;
  if (!result) throw new Error(`${fn}:EMPTY_RESULT`);

  if (!result.ok) {
    if (result.reason === 'insufficient_credits') {
      throw new Error(`INSUFFICIENT_CREDITS:${result.current_balance ?? 0}:${result.requested_amount ?? 0}`);
    }
    throw new Error(`${fn}:${result.reason ?? 'UNKNOWN_ERROR'}`);
  }

  return result;
}

export async function reserveCredits(
  adminDb: SupabaseClient,
  params: {
    operationId: string;
    tenantId: string;
    userId: string;
    amount: number;
    description: string;
    requestType?: string;
    task: string;
    metadata?: Record<string, unknown>;
  },
): Promise<CreditReservationResult> {
  const result = await callCreditRpc(adminDb, 'atomic_reserve_credits', {
    p_operation_id: params.operationId,
    p_amount: params.amount,
    p_description: params.description,
    p_tenant_id: params.tenantId,
    p_user_id: params.userId,
    p_metadata: {
      request_type: params.requestType ?? null,
      task: params.task,
      ...(params.metadata ?? {}),
    },
    p_source: 'ai_gateway.reserve',
  });

  return {
    operationId: result.operation_id ?? params.operationId,
    reservationId: result.reservation_id as string,
    finalBalance: Number(result.final_balance ?? 0),
    idempotent: !!result.idempotent,
  };
}

export async function commitReservedCredits(
  adminDb: SupabaseClient,
  params: {
    operationId: string;
    reservationId: string;
    tenantId: string;
    userId: string;
    description: string;
    metadata?: Record<string, unknown>;
  },
): Promise<number> {
  const result = await callCreditRpc(adminDb, 'atomic_commit_reserved_credits', {
    p_operation_id: params.operationId,
    p_reservation_id: params.reservationId,
    p_description: params.description,
    p_tenant_id: params.tenantId,
    p_user_id: params.userId,
    p_metadata: params.metadata ?? {},
    p_final_ledger_type: 'usage_ai',
    p_source: 'ai_gateway.commit',
  });

  return Number(result.final_balance ?? 0);
}

export async function releaseReservedCredits(
  adminDb: SupabaseClient,
  params: {
    operationId: string;
    reservationId: string;
    tenantId: string;
    userId: string;
    description: string;
    metadata?: Record<string, unknown>;
  },
): Promise<number> {
  const result = await callCreditRpc(adminDb, 'atomic_release_reserved_credits', {
    p_operation_id: params.operationId,
    p_reservation_id: params.reservationId,
    p_description: params.description,
    p_tenant_id: params.tenantId,
    p_user_id: params.userId,
    p_metadata: params.metadata ?? {},
    p_source: 'ai_gateway.release',
  });

  return Number(result.final_balance ?? 0);
}
