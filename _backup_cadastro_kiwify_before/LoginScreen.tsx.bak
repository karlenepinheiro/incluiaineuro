import React, { useState } from 'react';
import { Brain, ShieldCheck, Users, Zap, Eye, EyeOff, AlertCircle, CheckCircle2, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { BrandLogo } from './BrandLogo';
import { checkPurchaseByEmail } from '../services/purchaseActivationService';

// ── Google icon SVG inline (sem dependência extra) ────────────────────────────
const GoogleIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
);

// ── Máscaras e validação ────────────────────────────────────────────────────

function applyPhoneMask(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2)  return d.replace(/(\d{1,2})/, '($1');
  if (d.length <= 6)  return d.replace(/(\d{2})(\d+)/, '($1) $2');
  if (d.length <= 10) return d.replace(/(\d{2})(\d{4})(\d+)/, '($1) $2-$3');
  return d.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
}

function applyCPFMask(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 3)  return d;
  if (d.length <= 6)  return d.replace(/(\d{3})(\d+)/, '$1.$2');
  if (d.length <= 9)  return d.replace(/(\d{3})(\d{3})(\d+)/, '$1.$2.$3');
  return d.replace(/(\d{3})(\d{3})(\d{3})(\d+)/, '$1.$2.$3-$4');
}

export function validateCPF(cpf: string): boolean {
  const d = cpf.replace(/\D/g, '');
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += parseInt(d[i]) * (len + 1 - i);
    const rem = (sum * 10) % 11;
    return rem === 10 ? 0 : rem;
  };
  return calc(9) === parseInt(d[9]) && calc(10) === parseInt(d[10]);
}

export interface AuthScreenProps {
  onLogin: (email: string, pass: string) => Promise<void>;
  onRegister: (name: string, email: string, pass: string, phone: string, cpf: string) => Promise<void>;
  onGoogleLogin: () => Promise<void>;
  onGuest?: () => void;
  onForgotPassword?: () => void;
  /** Quando definido, exibe aviso de que precisa de conta para fazer upgrade */
  pendingPlanLabel?: string;
  /** Forçar aba inicial independente de pendingPlanLabel */
  initialTab?: 'login' | 'register';
}

export const LoginScreen: React.FC<AuthScreenProps> = ({
  onLogin,
  onRegister,
  onGoogleLogin,
  pendingPlanLabel,
  initialTab,
  onForgotPassword,
}) => {
  const [tab, setTab]               = useState<'login' | 'register'>(initialTab ?? (pendingPlanLabel ? 'register' : 'login'));
  const [name, setName]             = useState('');
  const [email, setEmail]           = useState('');
  const [phone, setPhone]           = useState('');
  const [cpf, setCpf]               = useState('');
  const [pass, setPass]             = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [showPass, setShowPass]     = useState(false);
  const [loading, setLoading]       = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError]           = useState('');
  const [success, setSuccess]       = useState('');
  const [pendingPurchase, setPendingPurchase] = useState<{ plan_code: string | null; credits?: number } | null>(null);
  const [checkingPurchase, setCheckingPurchase] = useState(false);

  const resetFields = () => {
    setName(''); setEmail(''); setPhone(''); setCpf('');
    setPass(''); setConfirmPass(''); setError(''); setSuccess('');
    setPendingPurchase(null);
  };

  const handleEmailBlur = async (value: string) => {
    if (tab !== 'register' || !value.trim() || !value.includes('@')) return;
    setCheckingPurchase(true);
    try {
      const result = await checkPurchaseByEmail(value.trim());
      if (result.found && result.status === 'APPROVED' && result.product_key !== 'UNKNOWN') {
        setPendingPurchase({ plan_code: result.plan_code ?? null, credits: result.credits });
      } else {
        setPendingPurchase(null);
      }
    } catch {
      // silencioso — não bloqueia o cadastro
    } finally {
      setCheckingPurchase(false);
    }
  };

  const switchTab = (t: 'login' | 'register') => { setTab(t); resetFields(); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!email.trim() || !pass.trim()) { setError('Preencha e-mail e senha.'); return; }

    if (tab === 'register') {
      if (!name.trim())        { setError('Informe seu nome completo.'); return; }

      const phoneDigits = phone.replace(/\D/g, '');
      if (phoneDigits.length < 10) { setError('Informe um telefone/WhatsApp válido com DDD.'); return; }

      const cpfDigits = cpf.replace(/\D/g, '');
      if (cpfDigits.length !== 11) { setError('Informe o CPF completo (11 dígitos).'); return; }
      if (!validateCPF(cpf))       { setError('CPF inválido. Verifique e tente novamente.'); return; }

      if (pass.length < 6)     { setError('A senha deve ter pelo menos 6 caracteres.'); return; }
      if (pass !== confirmPass) { setError('As senhas não coincidem.'); return; }
    }

    setLoading(true);
    try {
      if (tab === 'login') {
        await onLogin(email.trim(), pass);
      } else {
        await onRegister(name.trim(), email.trim(), pass, phone.trim(), cpf.replace(/\D/g, ''));
        setSuccess('Conta criada! Verifique seu e-mail se necessário.');
      }
    } catch (err: any) {
      const msg: string = err?.message ?? '';
      if (msg.includes('Invalid login credentials') || msg.includes('invalid_credentials'))
        setError('E-mail ou senha incorretos.');
      else if (msg.includes('already registered') || msg.includes('already in use'))
        setError('Este e-mail já está cadastrado. Faça login.');
      else if (msg.includes('email_not_confirmed'))
        setError('Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada.');
      else
        setError(msg || 'Erro inesperado. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError('');
    setGoogleLoading(true);
    try {
      await onGoogleLogin();
    } catch (err: any) {
      setError(err?.message || 'Erro ao conectar com Google.');
      setGoogleLoading(false);
    }
  };

  const inputStyle = {
    border: '1.5px solid #E7E2D8',
    background: '#FAFAFA',
    color: '#0F172A',
  };

  const focusStyle = (e: React.FocusEvent<HTMLInputElement>) => {
    (e.target as HTMLInputElement).style.borderColor = '#1F4E5F';
  };
  const blurStyle = (e: React.FocusEvent<HTMLInputElement>) => {
    (e.target as HTMLInputElement).style.borderColor = '#E7E2D8';
  };

  const features = [
    { icon: Brain,       text: 'Geração de PEI, PAEE e PDI com IA.' },
    { icon: Users,       text: 'Gestão completa de alunos neurodivergentes.' },
    { icon: Zap,         text: 'IncluiLab: atividades e materiais pedagógicos.' },
    { icon: ShieldCheck, text: 'Documentos com validação e conformidade.' },
  ];

  return (
    <div className="min-h-screen flex" style={{ background: '#F6F4EF' }}>

      {/* ── Painel esquerdo — design claro premium ── */}
      <div
        className="hidden md:flex flex-col justify-between w-[46%] p-12 relative overflow-hidden"
        style={{ background: 'linear-gradient(160deg, #EBF5F9 0%, #EEF2EE 100%)' }}
      >
        {/* Padrão de pontos suaves em petrol */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(31,78,95,0.06) 1px, transparent 0)',
            backgroundSize: '28px 28px',
          }}
        />

        <div className="relative z-10">
          <motion.div
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-12"
          >
            <BrandLogo fontSize={22} iconSize={22} theme="light" />
            <p className="mt-2 text-sm font-semibold tracking-wide italic" style={{ color: '#C69214' }}>
              Pense. Crie. Inclua.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <h2 className="text-3xl font-bold leading-tight mb-4" style={{ color: '#1F4E5F' }}>
              Tecnologia que inclui.<br />
              <span style={{ color: '#2E3A59' }}>Documentação que transforma.</span>
            </h2>
            <p className="text-base mb-10 leading-relaxed" style={{ color: '#4A6477' }}>
              A plataforma de IA para educadores e clínicos que atuam com estudantes neurodivergentes.
            </p>
          </motion.div>

          <div className="space-y-5">
            {features.map(({ icon: Icon, text }, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: 0.2 + i * 0.08 }}
                className="flex items-start gap-4"
              >
                <div
                  className="rounded-lg p-2 shrink-0"
                  style={{ background: 'rgba(31,78,95,0.10)', border: '1px solid rgba(31,78,95,0.12)' }}
                >
                  <Icon size={18} style={{ color: '#1F4E5F' }} />
                </div>
                <p className="text-sm leading-relaxed" style={{ color: '#334E5C' }}>{text}</p>
              </motion.div>
            ))}
          </div>
        </div>

        <div className="relative z-10">
          <p className="text-xs" style={{ color: '#6B8898' }}>
            &copy; {new Date().getFullYear()} IncluiAI — Todos os direitos reservados
          </p>
          <p className="text-xs font-semibold mt-0.5" style={{ color: '#1F4E5F' }}>
            www.incluiai.app.br
          </p>
        </div>
      </div>

      {/* ── Painel direito ── */}
      <div className="flex flex-1 items-center justify-center p-6 md:p-8">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md"
        >
          {/* Mobile logo */}
          <div className="mb-8 md:hidden">
            <BrandLogo fontSize={20} iconSize={18} theme="light" />
          </div>

          {/* Aviso de upgrade pendente */}
          {pendingPlanLabel && (
            <div
              className="mb-5 p-3.5 rounded-xl flex items-start gap-3 text-sm"
              style={{ background: '#FEF3C7', border: '1px solid #FCD34D', color: '#92400E' }}
            >
              <Zap size={16} className="shrink-0 mt-0.5" />
              <span>
                Para assinar o <strong>Plano {pendingPlanLabel}</strong>, crie uma conta gratuita primeiro.
                Você será redirecionado ao checkout após o cadastro.
              </span>
            </div>
          )}

          {/* Tabs */}
          <div
            className="flex mb-6 rounded-xl p-1"
            style={{ background: '#E7E2D8' }}
          >
            {(['login', 'register'] as const).map(t => (
              <button
                key={t}
                onClick={() => switchTab(t)}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all"
                style={{
                  background: tab === t ? '#FFFFFF' : 'transparent',
                  color: tab === t ? '#1F4E5F' : '#667085',
                  boxShadow: tab === t ? '0 1px 6px rgba(0,0,0,.10)' : 'none',
                }}
              >
                {t === 'login' ? 'Entrar' : 'Criar conta'}
              </button>
            ))}
          </div>

          <div
            className="rounded-2xl p-6 md:p-7"
            style={{ background: '#FFFFFF', border: '1px solid #E7E2D8', boxShadow: '0 4px 24px rgba(0,0,0,.06)' }}
          >
            {/* Google */}
            <button
              type="button"
              onClick={handleGoogle}
              disabled={googleLoading || loading}
              className="w-full flex items-center justify-center gap-3 py-2.5 rounded-xl text-sm font-semibold transition-all mb-4"
              style={{
                border: '1.5px solid #E7E2D8',
                background: '#FAFAFA',
                color: '#374151',
                cursor: googleLoading ? 'wait' : 'pointer',
              }}
            >
              {googleLoading
                ? <span className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                : <GoogleIcon size={18} />
              }
              {googleLoading ? 'Redirecionando...' : 'Continuar com Google'}
            </button>

            {/* Divisor */}
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-1 h-px" style={{ background: '#E7E2D8' }} />
              <span className="text-xs" style={{ color: '#94A3B8' }}>ou</span>
              <div className="flex-1 h-px" style={{ background: '#E7E2D8' }} />
            </div>

            {/* Formulário */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Nome — somente cadastro */}
              <AnimatePresence mode="wait">
                {tab === 'register' && (
                  <motion.div
                    key="name-field"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <label className="block text-xs font-semibold mb-1.5" style={{ color: '#2E3A59' }}>
                      Nome completo
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="Seu nome"
                      required={tab === 'register'}
                      className="w-full px-3.5 py-2.5 rounded-xl text-sm outline-none transition-all"
                      style={inputStyle}
                      onFocus={focusStyle}
                      onBlur={blurStyle}
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* E-mail */}
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: '#2E3A59' }}>
                  E-mail
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setPendingPurchase(null); }}
                  placeholder="seu@email.com"
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl text-sm outline-none transition-all"
                  style={inputStyle}
                  onFocus={focusStyle}
                  onBlur={async e => { blurStyle(e); await handleEmailBlur(e.target.value); }}
                />
                {checkingPurchase && (
                  <p className="mt-1.5 text-xs text-gray-400 flex items-center gap-1">
                    <span className="w-3 h-3 border border-gray-300 border-t-gray-500 rounded-full animate-spin inline-block" />
                    Verificando assinatura...
                  </p>
                )}
              </div>

              {/* Callout: compra pendente */}
              <AnimatePresence>
                {tab === 'register' && pendingPurchase && (
                  <motion.div
                    key="pending-purchase-callout"
                    initial={{ opacity: 0, y: -8, height: 0 }}
                    animate={{ opacity: 1, y: 0, height: 'auto' }}
                    exit={{ opacity: 0, y: -8, height: 0 }}
                    transition={{ duration: 0.22 }}
                    className="overflow-hidden"
                  >
                    <div
                      className="flex items-start gap-2.5 p-3 rounded-xl text-sm"
                      style={{ background: '#ECFDF5', border: '1px solid #6EE7B7', color: '#065F46' }}
                    >
                      <Sparkles size={15} className="shrink-0 mt-0.5" style={{ color: '#059669' }} />
                      <span>
                        <strong>Assinatura encontrada!</strong>{' '}
                        {pendingPurchase.plan_code
                          ? <>Seu plano <strong>{pendingPurchase.plan_code === 'MASTER' ? 'Master' : pendingPurchase.plan_code}</strong> será ativado automaticamente ao criar sua conta.</>
                          : <>Seu pacote de créditos será ativado automaticamente ao criar sua conta.</>
                        }
                      </span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Telefone e CPF — somente cadastro */}
              <AnimatePresence mode="wait">
                {tab === 'register' && (
                  <motion.div
                    key="contact-fields"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="space-y-4"
                  >
                    <div>
                      <label className="block text-xs font-semibold mb-1.5" style={{ color: '#2E3A59' }}>
                        Telefone / WhatsApp <span style={{ color: '#DC2626' }}>*</span>
                      </label>
                      <input
                        type="tel"
                        value={phone}
                        onChange={e => setPhone(applyPhoneMask(e.target.value))}
                        placeholder="(11) 99999-9999"
                        required={tab === 'register'}
                        inputMode="numeric"
                        className="w-full px-3.5 py-2.5 rounded-xl text-sm outline-none transition-all"
                        style={inputStyle}
                        onFocus={focusStyle}
                        onBlur={blurStyle}
                      />
                      <p className="mt-1 text-[11px]" style={{ color: '#94A3B8' }}>
                        Usado para recuperação de acesso sem e-mail
                      </p>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold mb-1.5" style={{ color: '#2E3A59' }}>
                        CPF <span style={{ color: '#DC2626' }}>*</span>
                      </label>
                      <input
                        type="text"
                        value={cpf}
                        onChange={e => setCpf(applyCPFMask(e.target.value))}
                        placeholder="000.000.000-00"
                        required={tab === 'register'}
                        inputMode="numeric"
                        className="w-full px-3.5 py-2.5 rounded-xl text-sm outline-none transition-all"
                        style={inputStyle}
                        onFocus={focusStyle}
                        onBlur={blurStyle}
                      />
                      <p className="mt-1 text-[11px]" style={{ color: '#94A3B8' }}>
                        Seus dados são protegidos conforme a LGPD
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Senha */}
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: '#2E3A59' }}>
                  Senha
                </label>
                <div className="relative">
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={pass}
                    onChange={e => setPass(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="w-full px-3.5 py-2.5 pr-10 rounded-xl text-sm outline-none transition-all"
                    style={inputStyle}
                    onFocus={focusStyle}
                    onBlur={blurStyle}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded transition"
                    style={{ color: '#94A3B8' }}
                  >
                    {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* Confirmar senha — somente cadastro */}
              <AnimatePresence mode="wait">
                {tab === 'register' && (
                  <motion.div
                    key="confirm-field"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <label className="block text-xs font-semibold mb-1.5" style={{ color: '#2E3A59' }}>
                      Confirmar senha
                    </label>
                    <input
                      type={showPass ? 'text' : 'password'}
                      value={confirmPass}
                      onChange={e => setConfirmPass(e.target.value)}
                      placeholder="••••••••"
                      required={tab === 'register'}
                      className="w-full px-3.5 py-2.5 rounded-xl text-sm outline-none transition-all"
                      style={inputStyle}
                      onFocus={focusStyle}
                      onBlur={blurStyle}
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Erro / Sucesso */}
              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="flex items-start gap-2 p-3 rounded-xl text-xs"
                    style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626' }}
                  >
                    <AlertCircle size={14} className="shrink-0 mt-0.5" />
                    {error}
                  </motion.div>
                )}
                {success && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="flex items-start gap-2 p-3 rounded-xl text-xs"
                    style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', color: '#16A34A' }}
                  >
                    <CheckCircle2 size={14} className="shrink-0 mt-0.5" />
                    {success}
                  </motion.div>
                )}
              </AnimatePresence>

              <button
                type="submit"
                disabled={loading || googleLoading}
                className="w-full py-3 rounded-xl text-sm font-bold text-white transition-all"
                style={{
                  background: loading ? '#4A7A8A' : 'linear-gradient(135deg, #1F4E5F, #2E3A59)',
                  boxShadow: loading ? 'none' : '0 4px 16px rgba(31,78,95,0.25)',
                  cursor: loading ? 'wait' : 'pointer',
                }}
              >
                {loading
                  ? (tab === 'login' ? 'Entrando...' : 'Criando conta...')
                  : (tab === 'login' ? 'Entrar na Plataforma' : 'Criar conta gratuita')
                }
              </button>
            </form>

            {tab === 'register' && (
              <p className="mt-4 text-center text-xs" style={{ color: '#94A3B8' }}>
                Ao criar sua conta você concorda com nossos{' '}
                <span style={{ color: '#1F4E5F', fontWeight: 600 }}>Termos de Uso</span>{' '}
                e{' '}
                <span style={{ color: '#1F4E5F', fontWeight: 600 }}>Política de Privacidade</span>
                . Nenhum cartão necessário.
              </p>
            )}

            {tab === 'login' && (
              <>
                {onForgotPassword && (
                  <div className="mt-3 text-center">
                    <button
                      type="button"
                      onClick={onForgotPassword}
                      className="text-xs font-medium transition-colors"
                      style={{ color: '#1F4E5F', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                    >
                      Esqueci minha senha
                    </button>
                  </div>
                )}
                <p className="mt-3 text-center text-xs" style={{ color: '#94A3B8' }}>
                  Suas informações são protegidas conforme a{' '}
                  <span style={{ color: '#1F4E5F', fontWeight: 600 }}>LGPD</span>.
                </p>
              </>
            )}
          </div>

          <p className="mt-4 text-center text-xs" style={{ color: '#94A3B8' }}>
            {tab === 'login'
              ? <>Não tem conta? <button onClick={() => switchTab('register')} className="font-semibold" style={{ color: '#1F4E5F' }}>Criar gratuitamente</button></>
              : <>Já tem conta? <button onClick={() => switchTab('login')} className="font-semibold" style={{ color: '#1F4E5F' }}>Entrar</button></>
            }
          </p>
        </motion.div>
      </div>
    </div>
  );
};
