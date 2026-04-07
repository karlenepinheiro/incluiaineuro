/**
 * ActivationView.tsx
 *
 * Tela de ativação de acesso pós-pagamento Kiwify.
 *
 * Estados possíveis:
 *   idle             → formulário de e-mail (ponto de entrada)
 *   checking         → consultando kiwify_purchases no banco
 *   approved         → pagamento confirmado; mostra form de cadastro (se não logado)
 *                      ou botão "Ativar agora" (se logado)
 *   pending          → pagamento em processamento (Kiwify ainda não confirmou)
 *   not_found        → nenhuma compra encontrada para este e-mail
 *   registering      → aguardando criação de perfil após signUp
 *   awaiting_email   → Supabase exige confirmação de e-mail antes de ativar
 *   activated        → plano ou créditos ativados com sucesso
 *   unknown_product  → produto não reconhecido pelo webhook (UNKNOWN)
 *   blocked_free     → usuário FREE tentou ativar créditos avulsos
 *   error            → erro genérico
 */

import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  AlertCircle,
  Loader2,
  Mail,
  Lock,
  User,
  ArrowRight,
  RefreshCw,
  ShieldAlert,
  Coins,
} from 'lucide-react';
import { supabase } from '../services/supabase';
import {
  checkPurchaseByEmail,
  activatePurchaseForUser,
} from '../services/purchaseActivationService';

// ── Paleta ────────────────────────────────────────────────────────────────────
const C = {
  petrol: '#1F4E5F',
  gold:   '#C69214',
  bg:     '#F6F4EF',
  border: '#E7E2D8',
};

type ActivationState =
  | 'idle'
  | 'checking'
  | 'approved'
  | 'pending'
  | 'not_found'
  | 'registering'
  | 'awaiting_email'
  | 'activated'
  | 'unknown_product'
  | 'blocked_free'
  | 'error';

interface Props {
  /** E-mail pré-preenchido (ex: vindo de query param da Kiwify) */
  initialEmail?: string;
  /** Se o usuário já está autenticado, passa o e-mail e dispara verificação automática */
  authenticatedEmail?: string;
  /** Chamado após ativação bem-sucedida para o App atualizar o estado global */
  onActivated: (planCode: string) => void;
  /** Volta para a landing/login */
  onBack: () => void;
}

export const ActivationView: React.FC<Props> = ({
  initialEmail,
  authenticatedEmail,
  onActivated,
  onBack,
}) => {
  const isLoggedIn = Boolean(authenticatedEmail);

  const [state, setState]           = useState<ActivationState>(
    isLoggedIn ? 'checking' : 'idle'
  );
  const [email, setEmail]           = useState(initialEmail ?? authenticatedEmail ?? '');
  const [purchaseId, setPurchaseId] = useState<string | null>(null);
  const [planCode, setPlanCode]     = useState<string | null>(null);
  const [creditsAmount, setCreditsAmount] = useState<number>(0);
  const [isCreditsOnly, setIsCreditsOnly] = useState(false);
  const [errorMsg, setErrorMsg]     = useState('');

  // Campos de cadastro
  const [name, setName]             = useState('');
  const [password, setPassword]     = useState('');
  const [confirm, setConfirm]       = useState('');
  const [regError, setRegError]     = useState('');
  const [regLoading, setRegLoading] = useState(false);

  // Se já está logado, verifica automaticamente ao montar
  useEffect(() => {
    if (isLoggedIn && authenticatedEmail) {
      runCheck(authenticatedEmail);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Verificação ─────────────────────────────────────────────────────────────
  const runCheck = async (emailToCheck: string) => {
    setState('checking');
    setErrorMsg('');
    try {
      const result = await checkPurchaseByEmail(emailToCheck);

      if (!result.found) {
        setState('not_found');
        return;
      }
      if (result.status === 'PENDING') {
        setState('pending');
        return;
      }

      // APPROVED — verificar se produto é reconhecido antes de prosseguir
      if (result.product_key === 'UNKNOWN') {
        setState('unknown_product');
        return;
      }

      setPurchaseId(result.purchase_id ?? null);
      setPlanCode(result.plan_code ?? null);

      const credits = result.credits ?? 0;
      const isCreditsPurchase = credits > 0 && !result.plan_code;
      setCreditsAmount(credits);
      setIsCreditsOnly(isCreditsPurchase);

      if (isLoggedIn && result.purchase_id) {
        await doActivation(result.purchase_id, result.plan_code, isCreditsPurchase);
      } else {
        setState('approved');
      }
    } catch (e: any) {
      setState('error');
      setErrorMsg(e?.message ?? 'Erro ao verificar pagamento.');
    }
  };

  // ── Ativação ────────────────────────────────────────────────────────────────
  const doActivation = async (pid: string, plan?: string | null, isCreditsPurchase?: boolean) => {
    try {
      const result = await activatePurchaseForUser(pid);

      if (result.ok) {
        setState('activated');
        // Para créditos avulsos: onActivated não muda o plano (App.tsx ignora o valor)
        onActivated(result.plan ?? plan ?? '');
        return;
      }

      if (result.reason === 'already_activated') {
        setState('activated');
        onActivated(plan ?? '');
        return;
      }

      if (result.reason === 'unknown_product') {
        setState('unknown_product');
        return;
      }

      if (result.reason === 'credits_require_subscription') {
        setState('blocked_free');
        return;
      }

      // Qualquer outro erro
      setState('error');
      setErrorMsg(
        result.message ??
        'Não foi possível ativar. Entre em contato com o suporte.'
      );
    } catch (e: any) {
      setState('error');
      setErrorMsg(e?.message ?? 'Erro ao ativar.');
    }
  };

  // ── Cadastro + ativação ─────────────────────────────────────────────────────
  const handleRegister = async () => {
    if (!name.trim())        { setRegError('Informe seu nome.'); return; }
    if (password.length < 6) { setRegError('Senha mínima de 6 caracteres.'); return; }
    if (password !== confirm) { setRegError('As senhas não conferem.'); return; }

    setRegLoading(true);
    setRegError('');
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: name.trim() } },
      });
      if (error) throw error;

      if (!data.session) {
        setState('awaiting_email');
        return;
      }

      // Sessão ativa imediatamente — aguarda trigger criar perfil (até ~4 s)
      setState('registering');
      for (let i = 0; i < 6; i++) {
        await new Promise(r => setTimeout(r, 700));
        const { data: profile } = await supabase
          .from('users')
          .select('id')
          .eq('id', data.user!.id)
          .maybeSingle();
        if (profile) break;
      }

      if (purchaseId) {
        await doActivation(purchaseId, planCode, isCreditsOnly);
      } else {
        setState('activated');
        onActivated(planCode ?? '');
      }
    } catch (e: any) {
      setRegError(e?.message ?? 'Erro ao criar conta.');
      setState('approved');
    } finally {
      setRegLoading(false);
    }
  };

  // ── Helpers visuais ─────────────────────────────────────────────────────────
  const planLabel = planCode === 'MASTER' ? 'Premium' : planCode === 'PRO' ? 'Pro' : planCode ?? '';

  const purchaseLabel = isCreditsOnly
    ? `+${creditsAmount} créditos`
    : `Plano ${planLabel}`;

  const activateButtonLabel = isCreditsOnly
    ? `Criar conta e adicionar ${creditsAmount} créditos`
    : `Criar conta e ativar Plano ${planLabel}`;

  const activatedTitle = isCreditsOnly
    ? `+${creditsAmount} créditos adicionados!`
    : `Plano ${planLabel} ativado!`;

  const activatedBody = isCreditsOnly
    ? 'Seus créditos foram adicionados à sua conta. Bom uso!'
    : 'Seu acesso está liberado. Bem-vindo ao IncluiAI!';

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div
      style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}
    >
      <div style={{ width: '100%', maxWidth: 460 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: C.petrol, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ color: '#fff', fontWeight: 800, fontSize: 18 }}>I</span>
            </div>
            <span style={{ fontWeight: 800, fontSize: 22, color: C.petrol }}>IncluiAI</span>
          </div>
          <p style={{ marginTop: 8, color: '#64748b', fontSize: 14 }}>Ativação de acesso</p>
        </div>

        <div style={{ background: '#fff', borderRadius: 16, border: `1px solid ${C.border}`, padding: '32px 28px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>

          {/* ── IDLE: formulário de e-mail ─────────────────────────────────── */}
          {state === 'idle' && (
            <>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: C.petrol, marginBottom: 8 }}>
                Ativar meu acesso
              </h2>
              <p style={{ color: '#64748b', fontSize: 14, marginBottom: 24, lineHeight: 1.5 }}>
                Informe o e-mail usado na compra para verificarmos seu pagamento.
              </p>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                E-mail da compra
              </label>
              <div style={{ position: 'relative', marginBottom: 20 }}>
                <Mail size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && email && runCheck(email)}
                  placeholder="seu@email.com"
                  style={{ width: '100%', boxSizing: 'border-box', paddingLeft: 36, paddingRight: 12, paddingTop: 10, paddingBottom: 10, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 14, outline: 'none' }}
                />
              </div>
              <button
                onClick={() => email && runCheck(email)}
                disabled={!email}
                style={{ width: '100%', background: C.petrol, color: '#fff', border: 'none', borderRadius: 8, padding: '11px 0', fontWeight: 700, fontSize: 15, cursor: email ? 'pointer' : 'not-allowed', opacity: email ? 1 : 0.5, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
              >
                Verificar pagamento <ArrowRight size={16} />
              </button>
              <button onClick={onBack} style={{ width: '100%', background: 'none', border: 'none', marginTop: 14, color: '#64748b', fontSize: 13, cursor: 'pointer' }}>
                ← Voltar
              </button>
            </>
          )}

          {/* ── CHECKING ─────────────────────────────────────────────────────── */}
          {state === 'checking' && (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <Loader2 size={40} style={{ color: C.petrol, animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
              <p style={{ color: '#64748b', fontSize: 15 }}>Verificando seu pagamento…</p>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          )}

          {/* ── REGISTERING ──────────────────────────────────────────────────── */}
          {state === 'registering' && (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <Loader2 size={40} style={{ color: C.petrol, animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
              <p style={{ color: '#64748b', fontSize: 15 }}>Criando sua conta e ativando…</p>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          )}

          {/* ── APPROVED: form de cadastro ───────────────────────────────────── */}
          {state === 'approved' && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: isCreditsOnly ? '#eff6ff' : '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {isCreditsOnly
                    ? <Coins size={22} style={{ color: '#2563eb' }} />
                    : <CheckCircle2 size={22} style={{ color: '#16a34a' }} />
                  }
                </div>
                <div>
                  <p style={{ fontWeight: 700, color: isCreditsOnly ? '#1d4ed8' : '#15803d', fontSize: 15, margin: 0 }}>
                    {isCreditsOnly ? 'Compra de créditos confirmada!' : 'Pagamento confirmado!'}
                  </p>
                  <p style={{ color: '#64748b', fontSize: 13, margin: 0 }}>{purchaseLabel} — {email}</p>
                </div>
              </div>

              {isCreditsOnly && (
                <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#1e40af', lineHeight: 1.5 }}>
                  Os créditos serão adicionados após você criar sua conta. Créditos avulsos exigem assinatura PRO ou Premium ativa.
                </div>
              )}

              <p style={{ color: '#374151', fontSize: 14, marginBottom: 20, lineHeight: 1.5 }}>
                Crie uma senha para ativar seu acesso ao IncluiAI.
              </p>

              {/* Nome */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Nome completo</label>
                <div style={{ position: 'relative' }}>
                  <User size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Seu nome"
                    style={{ width: '100%', boxSizing: 'border-box', paddingLeft: 36, paddingRight: 12, paddingTop: 10, paddingBottom: 10, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 14, outline: 'none' }}
                  />
                </div>
              </div>

              {/* E-mail (read-only) */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>E-mail</label>
                <div style={{ position: 'relative' }}>
                  <Mail size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                  <input
                    type="email"
                    value={email}
                    readOnly
                    style={{ width: '100%', boxSizing: 'border-box', paddingLeft: 36, paddingRight: 12, paddingTop: 10, paddingBottom: 10, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 14, background: '#f8fafc', color: '#64748b', outline: 'none' }}
                  />
                </div>
              </div>

              {/* Senha */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Criar senha</label>
                <div style={{ position: 'relative' }}>
                  <Lock size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    style={{ width: '100%', boxSizing: 'border-box', paddingLeft: 36, paddingRight: 12, paddingTop: 10, paddingBottom: 10, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 14, outline: 'none' }}
                  />
                </div>
              </div>

              {/* Confirmar senha */}
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Confirmar senha</label>
                <div style={{ position: 'relative' }}>
                  <Lock size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                  <input
                    type="password"
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleRegister()}
                    placeholder="Repita a senha"
                    style={{ width: '100%', boxSizing: 'border-box', paddingLeft: 36, paddingRight: 12, paddingTop: 10, paddingBottom: 10, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 14, outline: 'none' }}
                  />
                </div>
              </div>

              {regError && (
                <p style={{ color: '#dc2626', fontSize: 13, marginBottom: 14 }}>{regError}</p>
              )}

              <button
                onClick={handleRegister}
                disabled={regLoading}
                style={{ width: '100%', background: C.petrol, color: '#fff', border: 'none', borderRadius: 8, padding: '11px 0', fontWeight: 700, fontSize: 15, cursor: regLoading ? 'not-allowed' : 'pointer', opacity: regLoading ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
              >
                {regLoading
                  ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Criando conta…</>
                  : <>{activateButtonLabel} <ArrowRight size={16} /></>
                }
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              </button>

              <p style={{ textAlign: 'center', marginTop: 16, fontSize: 13, color: '#64748b' }}>
                Já tem conta?{' '}
                <button onClick={onBack} style={{ background: 'none', border: 'none', color: C.petrol, fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
                  Fazer login
                </button>
              </p>
            </>
          )}

          {/* ── AWAITING_EMAIL ────────────────────────────────────────────────── */}
          {state === 'awaiting_email' && (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <Mail size={44} style={{ color: C.petrol, margin: '0 auto 16px', display: 'block' }} />
              <h3 style={{ fontSize: 18, fontWeight: 700, color: C.petrol, marginBottom: 8 }}>Confirme seu e-mail</h3>
              <p style={{ color: '#64748b', fontSize: 14, lineHeight: 1.6, marginBottom: 20 }}>
                Enviamos um link de confirmação para <strong>{email}</strong>.<br />
                Clique no link para confirmar e seu {purchaseLabel} será ativado automaticamente ao fazer login.
              </p>
              <button onClick={onBack} style={{ background: C.petrol, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 24px', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
                Ir para o login
              </button>
            </div>
          )}

          {/* ── PENDING ──────────────────────────────────────────────────────── */}
          {state === 'pending' && (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <div style={{ width: 60, height: 60, borderRadius: '50%', background: '#fef9c3', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <Clock size={30} style={{ color: '#ca8a04' }} />
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: '#92400e', marginBottom: 8 }}>Pagamento em processamento</h3>
              <p style={{ color: '#64748b', fontSize: 14, lineHeight: 1.6, marginBottom: 20 }}>
                Seu pagamento foi recebido e está sendo confirmado.<br />
                Isso pode levar alguns minutos. Tente novamente em instantes.
              </p>
              <button
                onClick={() => setState('idle')}
                style={{ background: C.gold, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontWeight: 700, fontSize: 14, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}
              >
                <RefreshCw size={15} /> Verificar novamente
              </button>
            </div>
          )}

          {/* ── NOT_FOUND ─────────────────────────────────────────────────────── */}
          {state === 'not_found' && (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <div style={{ width: 60, height: 60, borderRadius: '50%', background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <AlertCircle size={30} style={{ color: '#dc2626' }} />
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: '#991b1b', marginBottom: 8 }}>Compra não encontrada</h3>
              <p style={{ color: '#64748b', fontSize: 14, lineHeight: 1.6, marginBottom: 8 }}>
                Não encontramos uma compra aprovada para <strong>{email}</strong>.
              </p>
              <p style={{ color: '#64748b', fontSize: 13, marginBottom: 20 }}>
                Verifique se o e-mail é o mesmo usado na Kiwify, ou aguarde alguns minutos e tente novamente.
              </p>
              <button
                onClick={() => setState('idle')}
                style={{ background: C.petrol, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontWeight: 700, fontSize: 14, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8, marginRight: 10 }}
              >
                Tentar outro e-mail
              </button>
              <button onClick={onBack} style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 20px', fontWeight: 600, fontSize: 14, cursor: 'pointer', color: '#64748b' }}>
                Voltar
              </button>
            </div>
          )}

          {/* ── UNKNOWN_PRODUCT ───────────────────────────────────────────────── */}
          {state === 'unknown_product' && (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <div style={{ width: 60, height: 60, borderRadius: '50%', background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <ShieldAlert size={30} style={{ color: '#d97706' }} />
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: '#92400e', marginBottom: 8 }}>
                Produto não identificado
              </h3>
              <p style={{ color: '#64748b', fontSize: 14, lineHeight: 1.6, marginBottom: 8 }}>
                Encontramos uma compra aprovada para <strong>{email}</strong>, mas não conseguimos identificar o produto adquirido.
              </p>
              <p style={{ color: '#64748b', fontSize: 13, lineHeight: 1.5, marginBottom: 20 }}>
                Isso pode ocorrer quando o produto não está cadastrado em nossa base. Entre em contato com o suporte — resolveremos manualmente em até 24h.
              </p>
              <a
                href="mailto:suporte@incluiai.com"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: C.gold, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontWeight: 700, fontSize: 14, cursor: 'pointer', textDecoration: 'none', marginRight: 10 }}
              >
                <Mail size={15} /> Contatar suporte
              </a>
              <button onClick={onBack} style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 20px', fontWeight: 600, fontSize: 14, cursor: 'pointer', color: '#64748b' }}>
                Voltar
              </button>
            </div>
          )}

          {/* ── BLOCKED_FREE ──────────────────────────────────────────────────── */}
          {state === 'blocked_free' && (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <div style={{ width: 60, height: 60, borderRadius: '50%', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <Coins size={30} style={{ color: '#2563eb' }} />
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: '#1e40af', marginBottom: 8 }}>
                Assinatura necessária
              </h3>
              <p style={{ color: '#374151', fontSize: 14, lineHeight: 1.6, marginBottom: 8 }}>
                Pacotes de créditos avulsos são exclusivos para assinantes ativos do IncluiAI.
              </p>
              <p style={{ color: '#64748b', fontSize: 13, lineHeight: 1.5, marginBottom: 20 }}>
                Adquira um plano PRO ou Premium e depois ative seus créditos normalmente com o mesmo e-mail da compra.
              </p>
              <button
                onClick={onBack}
                style={{ background: C.petrol, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontWeight: 700, fontSize: 14, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8, marginRight: 10 }}
              >
                Ver planos
              </button>
              <a
                href="mailto:suporte@incluiai.com"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'none', border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 20px', fontWeight: 600, fontSize: 14, cursor: 'pointer', color: '#64748b', textDecoration: 'none' }}
              >
                Falar com suporte
              </a>
            </div>
          )}

          {/* ── ACTIVATED ────────────────────────────────────────────────────── */}
          {state === 'activated' && (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: isCreditsOnly ? '#eff6ff' : '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                {isCreditsOnly
                  ? <Coins size={34} style={{ color: '#2563eb' }} />
                  : <CheckCircle2 size={34} style={{ color: '#16a34a' }} />
                }
              </div>
              <h3 style={{ fontSize: 20, fontWeight: 800, color: C.petrol, marginBottom: 8 }}>
                {activatedTitle}
              </h3>
              <p style={{ color: '#64748b', fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>
                {activatedBody}
              </p>
              <button
                onClick={onBack}
                style={{ background: C.petrol, color: '#fff', border: 'none', borderRadius: 8, padding: '11px 28px', fontWeight: 700, fontSize: 15, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}
              >
                Acessar o sistema <ArrowRight size={16} />
              </button>
            </div>
          )}

          {/* ── ERROR ─────────────────────────────────────────────────────────── */}
          {state === 'error' && (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <div style={{ width: 60, height: 60, borderRadius: '50%', background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <AlertCircle size={30} style={{ color: '#dc2626' }} />
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: '#991b1b', marginBottom: 8 }}>Algo deu errado</h3>
              <p style={{ color: '#64748b', fontSize: 14, marginBottom: 20 }}>{errorMsg}</p>
              <button
                onClick={() => setState('idle')}
                style={{ background: C.petrol, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontWeight: 700, fontSize: 14, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8, marginRight: 10 }}
              >
                <RefreshCw size={15} /> Tentar novamente
              </button>
              <button onClick={onBack} style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 20px', fontWeight: 600, fontSize: 14, cursor: 'pointer', color: '#64748b' }}>
                Voltar
              </button>
            </div>
          )}
        </div>

        <p style={{ textAlign: 'center', marginTop: 20, fontSize: 12, color: '#9ca3af' }}>
          Problemas? Entre em contato:{' '}
          <a href="mailto:suporte@incluiai.com" style={{ color: C.petrol }}>suporte@incluiai.com</a>
        </p>
      </div>
    </div>
  );
};
