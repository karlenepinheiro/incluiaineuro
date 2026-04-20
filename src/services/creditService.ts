/**
 * creditService.ts
 * Gerencia carteira de créditos, razão (ledger) e concessões manuais.
 * Toda operação de crédito gera entrada no ledger — o saldo é sempre derivado.
 */

import { supabase } from './supabase';
import type { CreditLedgerEntry, CreditLedgerType, AdminGrant, AdminGrantType } from '../types';

// ---------------------------------------------------------------------------
// CARTEIRA
// ---------------------------------------------------------------------------

export const CreditWalletService = {
  /** Retorna o saldo disponível de um tenant (via credits_wallet.balance) */
  async getBalance(tenantId: string): Promise<number> {
    // credits_wallet colunas REAIS: id, tenant_id, balance, last_reset_at, updated_at
    // NÃO EXISTEM: credits_available, total_earned, total_spent, reset_at
    const { data, error } = await supabase
      .from('credits_wallet')
      .select('balance')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return 0;
    return Number(data.balance ?? 0);
  },

  /** Resumo da carteira — retorna apenas colunas reais */
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
      total_earned: 0,   // coluna inexistente — retorna 0 para não quebrar a UI
      total_spent: 0,    // coluna inexistente — retorna 0 para não quebrar a UI
      reset_at: (data as any)?.last_reset_at ?? null,
    };
  },
};

// ---------------------------------------------------------------------------
// LEDGER (razão)
// ---------------------------------------------------------------------------

/**
 * Identifica lançamentos de bootstrap FREE legados que não devem
 * aparecer no histórico visual de tenants com plano pago.
 *
 * Dois sinais são usados em conjunto para robustez:
 *   1. source = 'free_bootstrap'  → marcado pelo SQL fix_billing_v7
 *   2. Padrão de descrição        → fallback para entradas já existentes
 *
 * AUDITORIA: getGlobalHistory() NÃO aplica este filtro — CEO vê tudo.
 */
export function isFreeBootstrapEntry(entry: CreditLedgerEntry): boolean {
  if (entry.source === 'free_bootstrap') return true;
  const desc = (entry.description ?? '').toLowerCase();
  return (
    entry.amount > 0 &&
    entry.amount <= 60 &&
    desc.includes('iniciais') &&
    desc.includes('free')
  );
}

export const CreditLedgerService = {
  /**
   * Histórico de movimentações de um tenant.
   *
   * @param options.excludeFreeBootstrap  Quando true, omite o lançamento
   *   inicial FREE (60 créditos de boas-vindas) se o tenant já tiver
   *   ativado um plano pago. Não apaga dados — apenas filtra a exibição.
   */
  async getHistory(
    tenantId: string,
    limit = 50,
    options?: { excludeFreeBootstrap?: boolean },
  ): Promise<CreditLedgerEntry[]> {
    const { data, error } = await supabase
      .from('credits_ledger')
      .select('id, tenant_id, user_id, type, amount, description, source, created_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;

    const entries = (data ?? []).map(mapLedgerEntry);

    if (options?.excludeFreeBootstrap) {
      return entries.filter(e => !isFreeBootstrapEntry(e));
    }
    return entries;
  },

  /** Histórico global (para o painel CEO) — sem filtros, auditoria completa. */
  async getGlobalHistory(limit = 100): Promise<CreditLedgerEntry[]> {
    const { data, error } = await supabase
      .from('credits_ledger')
      .select('id, tenant_id, user_id, type, amount, description, source, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []).map(mapLedgerEntry);
  },

  /**
   * Adiciona créditos ao tenant.
   * Registra no ledger (credits_ledger) e atualiza credits_wallet.balance.
   */
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

    // 1. Registra no ledger — colunas reais: tenant_id, user_id, type, amount, description
    const { error: ledgerError } = await supabase.from('credits_ledger').insert({
      tenant_id:   params.tenantId,
      user_id:     params.createdBy ?? null,
      type:        params.type,
      amount:      params.amount,
      description: params.description,
    });
    if (ledgerError) throw ledgerError;

    // 2. Atualiza credits_wallet.balance (única coluna real)
    const { data: wallet } = await supabase
      .from('credits_wallet')
      .select('balance')
      .eq('tenant_id', params.tenantId)
      .maybeSingle();

    if (wallet) {
      await supabase.from('credits_wallet').update({
        balance:    Math.max(0, Number(wallet.balance ?? 0) + params.amount),
        updated_at: new Date().toISOString(),
      }).eq('tenant_id', params.tenantId);
    }
  },

  /**
   * Remove créditos do tenant.
   * amount deve ser positivo — sinal negativo aplicado internamente no ledger.
   */
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

    // Registra saída (negativo) no ledger
    const { error: ledgerError } = await supabase.from('credits_ledger').insert({
      tenant_id:   params.tenantId,
      user_id:     params.createdBy ?? null,
      type:        params.type,
      amount:      -params.amount,
      description: params.description,
    });
    if (ledgerError) throw ledgerError;

    // Decrementa credits_wallet.balance
    const { data: wallet } = await supabase
      .from('credits_wallet')
      .select('balance')
      .eq('tenant_id', params.tenantId)
      .maybeSingle();

    if (wallet) {
      await supabase.from('credits_wallet').update({
        balance:    Math.max(0, Number(wallet.balance ?? 0) - params.amount),
        updated_at: new Date().toISOString(),
      }).eq('tenant_id', params.tenantId);
    }
  },
};

// ---------------------------------------------------------------------------
// ADMIN GRANTS (concessões manuais)
// ---------------------------------------------------------------------------

export const AdminGrantService = {
  // admin_grants NÃO EXISTE no schema real — todos os métodos retornam fallback seguro.

  /** Histórico de concessões de um tenant */
  async getForTenant(_tenantId: string): Promise<AdminGrant[]> {
    return [];
  },

  /** Histórico global de concessões (painel CEO) */
  async getAll(_limit = 100): Promise<AdminGrant[]> {
    return [];
  },

  /**
   * Concede créditos manualmente — registra apenas no ledger real (credits_ledger).
   */
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
    const type: CreditLedgerType = isRefund ? 'refund' : 'manual_grant';
    const description = isRefund
      ? `Estorno de ${absAmount} créditos — ${params.reason}`
      : `Bônus de ${absAmount} créditos — ${params.reason}`;

    if (isRefund) {
      await CreditLedgerService.deductCredits({
        tenantId: params.tenantId,
        amount: absAmount,
        type: 'refund',
        description,
        createdBy: params.grantedById,
      });
    } else {
      await CreditLedgerService.addCredits({
        tenantId: params.tenantId,
        amount: absAmount,
        type,
        description,
        createdBy: params.grantedById,
        createdByName: params.grantedByName,
      });
    }
  },

  /** Registra outra operação manual — no-op (tabela inexistente) */
  async logGrant(_params: {
    tenantId: string;
    grantType: AdminGrantType;
    value: string;
    reason: string;
    grantedById?: string;
    grantedByName?: string;
  }): Promise<void> {
    // admin_grants não existe — operação no-op silenciosa
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
