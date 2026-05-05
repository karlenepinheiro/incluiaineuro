/**
 * _credits.ts — Validação e débito de créditos no servidor (Sub-etapa 2A)
 *
 * Usa service_role para bypassar RLS e ter acesso autoritativo ao saldo.
 * Durante a 2A, o frontend ainda debita em paralelo (duplicação temporária).
 * Entradas do ledger geradas aqui têm prefixo "[gateway]" para rastreabilidade.
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ─── Contexto do tenant/usuário ───────────────────────────────────────────────

export interface TenantContext {
  tenantId: string;
  userId:   string;
}

/**
 * Busca tenant_id e userId a partir do uid do JWT.
 * Usa service_role para garantir acesso mesmo com RLS restritiva.
 */
export async function getTenantContext(
  adminDb: SupabaseClient,
  uid:     string,
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

// ─── Verificação de saldo ─────────────────────────────────────────────────────

export interface WalletState {
  walletId: string;
  balance:  number;
}

/**
 * Lê o saldo atual do tenant.
 * Retorna null se a wallet não existir (tenant sem carteira = permite a operação,
 * compatível com o comportamento atual do frontend).
 */
export async function getWallet(
  adminDb:  SupabaseClient,
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

/**
 * Verifica se o tenant tem saldo suficiente.
 * Lança erro estruturado capturável pelo index.ts:
 *   INSUFFICIENT_CREDITS:<balance>:<required>
 *
 * Se a wallet não existir, permite (fallback gracioso — mesma regra do frontend).
 */
export async function checkCredits(
  adminDb:  SupabaseClient,
  tenantId: string,
  required: number,
): Promise<WalletState | null> {
  if (required <= 0) return null; // sem requisito mínimo — pula a verificação

  const wallet = await getWallet(adminDb, tenantId);
  if (!wallet) {
    console.warn('[_credits] Wallet não encontrada para tenant', tenantId, '— operação permitida');
    return null;
  }

  if (wallet.balance < required) {
    throw new Error(`INSUFFICIENT_CREDITS:${wallet.balance}:${required}`);
  }

  return wallet;
}

// ─── Débito ───────────────────────────────────────────────────────────────────

/**
 * Debita créditos e registra no ledger com prefixo "[gateway]".
 * Retorna o saldo restante.
 *
 * Usa tenant_id (não walletId) para garantir que o UPDATE sempre acerta a linha
 * correta — evita o bug silencioso onde .eq('id', null) afeta 0 rows sem erro.
 * Lança em caso de falha para que o index.ts deixe creditsRemaining undefined
 * e o frontend realize o débito como fallback.
 */
export async function debitCredits(
  adminDb:     SupabaseClient,
  wallet:      WalletState,
  tenantId:    string,
  userId:      string,
  cost:        number,
  description: string,
): Promise<number> {
  const next = Math.max(0, wallet.balance - cost);

  // UPDATE usando tenant_id — mais robusto que walletId (evita 0-row silencioso)
  const { data: updatedRows, error: updateErr } = await adminDb
    .from('credits_wallet')
    .update({ balance: next })
    .eq('tenant_id', tenantId)
    .select('balance');

  if (updateErr) {
    console.error('[_credits] debitCredits update error:', updateErr.message);
    throw new Error(`WALLET_UPDATE_FAILED: ${updateErr.message}`);
  }

  if (!updatedRows || updatedRows.length === 0) {
    // UPDATE afetou 0 rows — wallet não existe ou tenant_id incorreto
    console.error('[_credits] debitCredits: 0 rows updated for tenant', tenantId);
    throw new Error('WALLET_UPDATE_NO_ROWS');
  }

  // Ledger entry SOMENTE após update confirmado — prefixo "[gateway]" para rastreabilidade
  await adminDb.from('credits_ledger').insert({
    tenant_id:   tenantId,
    user_id:     userId,
    type:        'usage_ai',
    amount:      -cost,
    description: `[gateway] ${description}`,
  }).then(({ error }) => {
    if (error) console.warn('[_credits] ledger insert warn:', error.message);
  });

  return next;
}
