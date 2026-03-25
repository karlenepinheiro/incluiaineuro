/**
 * referralService.ts
 * Sistema de indicação viral — gera códigos únicos, rastreia indicações,
 * captura ?ref= na URL e concede créditos IA ao concluir conversão.
 */

import { supabase } from './supabase';
import { CreditLedgerService } from './creditService';

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'incluiai_referral_ref';
const APP_URL     = 'https://incluiai.app.br';

/** Créditos concedidos ao referrer por plano assinado */
const CREDITS_BY_PLAN: Record<string, number> = {
  PRO:       10,
  MASTER:    20,
  PREMIUM:   20,   // alias legacy
};

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface ReferralStats {
  referralCode:      string;
  totalReferrals:    number;
  convertedReferrals: number;
  creditsEarned:     number;
}

// ---------------------------------------------------------------------------
// Serviço
// ---------------------------------------------------------------------------

export const ReferralService = {

  // ── Utilitários de código ──────────────────────────────────────────────

  /** Gera string aleatória de 8 chars A-Z0-9 */
  generateCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    return Array.from(
      { length: 8 },
      () => chars[Math.floor(Math.random() * chars.length)]
    ).join('');
  },

  /** Monta o link completo de indicação */
  getReferralLink(code: string): string {
    return `${APP_URL}/?ref=${code}`;
  },

  // ── localStorage ──────────────────────────────────────────────────────

  /** Persiste o código referral da URL para uso posterior no cadastro */
  saveRefToStorage(code: string): void {
    try { localStorage.setItem(STORAGE_KEY, code.trim().toUpperCase()); } catch {}
  },

  /** Lê o código referral salvo no localStorage */
  getRefFromStorage(): string | null {
    try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
  },

  /** Remove o código referral do localStorage após registro */
  clearRefFromStorage(): void {
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  },

  // ── Banco de dados ────────────────────────────────────────────────────

  /**
   * Obtém o referral_code do usuário.
   * Se ainda não existe, gera um código único e salva no banco.
   */
  async getOrCreateReferralCode(userId: string): Promise<string> {
    const { data, error } = await supabase
      .from('users')
      .select('referral_code')
      .eq('id', userId)
      .maybeSingle();

    if (error) throw error;
    if (data?.referral_code) return data.referral_code as string;

    // Gera código único (tenta até 5 vezes para evitar colisão)
    let code = this.generateCode();
    for (let i = 0; i < 5; i++) {
      const { data: existing } = await supabase
        .from('users')
        .select('id')
        .eq('referral_code', code)
        .maybeSingle();
      if (!existing) break;
      code = this.generateCode();
    }

    await supabase
      .from('users')
      .update({ referral_code: code })
      .eq('id', userId);

    return code;
  },

  /**
   * Retorna estatísticas de indicação do usuário
   * (código, total indicado, convertidos, créditos ganhos).
   */
  async getStats(userId: string): Promise<ReferralStats> {
    const { data: userRow } = await supabase
      .from('users')
      .select('referral_code')
      .eq('id', userId)
      .maybeSingle();

    const code = (userRow?.referral_code as string | null) ?? '';

    if (!code) {
      return { referralCode: '', totalReferrals: 0, convertedReferrals: 0, creditsEarned: 0 };
    }

    const { data: referrals } = await supabase
      .from('referrals')
      .select('id, status, credits_awarded')
      .eq('referrer_user_id', userId);

    const rows = referrals ?? [];
    return {
      referralCode:       code,
      totalReferrals:     rows.length,
      convertedReferrals: rows.filter(r => r.status !== 'pending').length,
      creditsEarned:      rows.reduce((s, r) => s + (Number(r.credits_awarded) || 0), 0),
    };
  },

  /**
   * Registra a indicação quando um novo usuário faz login pela primeira vez.
   * Deve ser chamado após o login bem-sucedido se houver um código no localStorage.
   *
   * Proteções:
   *   - Usuário não pode se auto-indicar
   *   - Cada usuário só pode ser indicado uma vez (referred_by preenchido = skip)
   */
  async registerReferral(referredUserId: string, refCode: string): Promise<void> {
    const code = refCode.trim().toUpperCase();
    if (!code) return;

    // Localiza o referrer pelo código
    const { data: referrer } = await supabase
      .from('users')
      .select('id, tenant_id')
      .eq('referral_code', code)
      .maybeSingle();

    // Código inválido ou auto-indicação
    if (!referrer || referrer.id === referredUserId) return;

    // Verifica se o usuário já tem referred_by
    const { data: referredUser } = await supabase
      .from('users')
      .select('referred_by')
      .eq('id', referredUserId)
      .maybeSingle();

    if (referredUser?.referred_by) return; // já indicado anteriormente

    // Salva referred_by no usuário indicado
    await supabase
      .from('users')
      .update({ referred_by: code })
      .eq('id', referredUserId);

    // Cria registro de indicação (status = pending)
    await supabase.from('referrals').insert({
      referrer_user_id:   referrer.id,
      referred_user_id:   referredUserId,
      referrer_tenant_id: referrer.tenant_id ?? null,
      status:             'pending',
      credits_awarded:    0,
    });

    // Limpa o localStorage após registrar
    this.clearRefFromStorage();
  },

  /**
   * Processa a conversão de uma indicação após pagamento confirmado.
   * Credita créditos IA ao tenant do referrer.
   *
   * Valores: PRO → 10 créditos | MASTER → 20 créditos
   */
  async processConversion(referredUserId: string, planCode: string): Promise<void> {
    const credits = CREDITS_BY_PLAN[planCode.toUpperCase()] ?? 0;
    if (!credits) return;

    // Busca a indicação pendente
    const { data: referral } = await supabase
      .from('referrals')
      .select('id, referrer_user_id, referrer_tenant_id, status')
      .eq('referred_user_id', referredUserId)
      .eq('status', 'pending')
      .maybeSingle();

    if (!referral) return; // sem indicação pendente

    // Atualiza status → rewarded
    await supabase
      .from('referrals')
      .update({
        status:          'rewarded',
        plan_code:       planCode.toUpperCase(),
        credits_awarded: credits,
        updated_at:      new Date().toISOString(),
      })
      .eq('id', referral.id);

    // Adiciona créditos ao tenant do referrer
    if (referral.referrer_tenant_id) {
      await CreditLedgerService.addCredits({
        tenantId:    referral.referrer_tenant_id,
        amount:      credits,
        type:        'bonus',
        description: `Créditos por indicação convertida (plano ${planCode.toUpperCase()})`,
        createdBy:   referral.referrer_user_id,
      });
    }
  },
};
