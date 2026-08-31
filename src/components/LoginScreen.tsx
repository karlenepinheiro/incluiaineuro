import React, { useState, useRef } from 'react';
import { Brain, ShieldCheck, Users, Zap, Eye, EyeOff, AlertCircle, CheckCircle2, Sparkles, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { BrandLogo } from './BrandLogo';
import { checkPurchaseByEmail } from '../services/purchaseActivationService';
import { waUrl } from '../config/contact';
import type { ProfileSex } from '../types';

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

// ── Ícone WhatsApp inline ──────────────────────────────────────────────────

const WaIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
  </svg>
);

// ── Mensagem WhatsApp aprovada pela CEO ────────────────────────────────────

const WA_CADASTRO_MSG =
  'Olá! Fiz uma compra do IncluiAI pela Kiwify, mas o sistema não localizou minha compra com o e-mail informado. Preciso de ajuda para acessar minha conta.';

// ── Props ──────────────────────────────────────────────────────────────────

export interface AuthScreenProps {
  onLogin: (email: string, pass: string) => Promise<void>;
  onRegister: (name: string, email: string, pass: string, phone: string, cpf: string, sex: ProfileSex) => Promise<void>;
  /** Mantido para compatibilidade com App.tsx — não exposto na interface. */
  onGoogleLogin?: () => Promise<void>;
  onGuest?: () => void;
  onForgotPassword?: () => void;
  pendingPlanLabel?: string;
  initialTab?: 'login' | 'register';
}

// ── Componente ─────────────────────────────────────────────────────────────

export const LoginScreen: React.FC<AuthScreenProps> = ({
  onLogin,
  onRegister,
  pendingPlanLabel,
  initialTab,
  onForgotPassword,
}) => {
  const [tab, setTab]               = useState<'login' | 'register'>(initialTab ?? (pendingPlanLabel ? 'register' : 'login'));
  const [name, setName]             = useState('');
  const [email, setEmail]           = useState('');
  const [phone, setPhone]           = useState('');
  const [cpf, setCpf]               = useState('');
  const [sex, setSex]               = useState<ProfileSex>('unspecified');
  const [pass, setPass]             = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [showPass, setShowPass]     = useState(false);
  const [loading, setLoading]       = useState(false);
  const [loadingPhase, setLoadingPhase] = useState<'verifying' | 'creating' | null>(null);
  const [error, setError]           = useState('');
  const [success, setSuccess]       = useState('');
  const [pendingPurchase, setPendingPurchase] = useState<{ plan_code: string | null; credits?: number } | null>(null);
  const [checkingPurchase, setCheckingPurchase] = useState(false);

  // ── Estados do modal de compra ──────────────────────────────────────────
  const [showPurchaseModal, setShowPurchaseModal]   = useState(false);
  const [purchaseModalType, setPurchaseModalType]   = useState<'not_found' | 'network_error'>('not_found');
  const [pendingFormData, setPendingFormData]       = useState<{
    name: string; email: string; pass: string; phone: string; cpf: string; sex: ProfileSex;
  } | null>(null);

  const emailRef = useRef<HTMLInputElement>(null);

  const resetFields = () => {
    setName(''); setEmail(''); setPhone(''); setCpf(''); setSex('unspecified');
    setPass(''); setConfirmPass(''); setError(''); setSuccess('');
    setPendingPurchase(null); setPendingFormData(null);
    setShowPurchaseModal(false);
  };

  // Verificação informativa no blur (não bloqueante — serve só para callout verde)
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
      // silencioso no blur — a verificação bloqueante ocorre no submit
    } finally {
      setCheckingPurchase(false);
    }
  };

  const switchTab = (t: 'login' | 'register') => { setTab(t); resetFields(); };

  // ── "Tentar novamente" — fecha modal e foca e-mail (mantém campos) ──────
  const handleReviseEmail = () => {
    setShowPurchaseModal(false);
    setTimeout(() => emailRef.current?.focus(), 80);
  };

  // ── Submit principal ───────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!email.trim() || !pass.trim()) { setError('Preencha e-mail e senha.'); return; }

    if (tab === 'register') {
      if (!name.trim()) { setError('Informe seu nome completo.'); return; }

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
        // Normalização canônica do e-mail
        const normalizedEmail = email.trim().toLowerCase();
        const formData = {
          name:  name.trim(),
          email: normalizedEmail,
          pass,
          phone: phone.trim(),
          cpf:   cpf.replace(/\D/g, ''),
          sex,
        };

        // ── PASSO 1: verificar compra aprovada (BLOQUEANTE) ─────────────────
        setLoadingPhase('verifying');
        let purchaseResult;
        try {
          purchaseResult = await checkPurchaseByEmail(normalizedEmail);
        } catch {
          // Erro técnico de rede/timeout — não cria conta como fallback
          setLoading(false);
          setLoadingPhase(null);
          setPendingFormData(formData);
          setPurchaseModalType('network_error');
          setShowPurchaseModal(true);
          return;
        }

        const isApproved =
          purchaseResult.found &&
          purchaseResult.status === 'APPROVED' &&
          purchaseResult.product_key !== 'UNKNOWN';

        if (!isApproved) {
          setLoading(false);
          setLoadingPhase(null);
          setPendingFormData(formData);
          setPurchaseModalType('not_found');
          setShowPurchaseModal(true);
          return;
        }

        // ── PASSO 2: compra confirmada — criar conta ────────────────────────
        setLoadingPhase('creating');
        await onRegister(formData.name, formData.email, formData.pass, formData.phone, formData.cpf, formData.sex);
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
      setLoadingPhase(null);
    }
  };

  // ── Estilos ──────────────────────────────────────────────────────────────

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

  const buttonLabel = loading
    ? loadingPhase === 'verifying'
      ? 'Verificando compra...'
      : loadingPhase === 'creating'
        ? 'Criando conta...'
        : 'Entrando...'
    : tab === 'login'
      ? 'Entrar na Plataforma'
      : 'Criar conta';

  return (
    <>
      <div className="min-h-screen flex" style={{ background: '#F6F4EF' }}>

        {/* ── Painel esquerdo ── */}
        <div
          className="hidden md:flex flex-col justify-between w-[46%] p-12 relative overflow-hidden"
          style={{ background: 'linear-gradient(160deg, #EBF5F9 0%, #EEF2EE 100%)' }}
        >
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

            {/* Aviso de plano pendente */}
            {pendingPlanLabel && (
              <div
                className="mb-5 p-3.5 rounded-xl flex items-start gap-3 text-sm"
                style={{ background: '#FEF3C7', border: '1px solid #FCD34D', color: '#92400E' }}
              >
                <Zap size={16} className="shrink-0 mt-0.5" />
                <span>
                  Para assinar o <strong>Plano {pendingPlanLabel}</strong>, crie uma conta primeiro.
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
                    ref={emailRef}
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

                {/* Callout: compra encontrada (informativo) */}
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
                          <strong>Compra encontrada!</strong>{' '}
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

                      <div>
                        <label className="block text-xs font-semibold mb-1.5" style={{ color: '#2E3A59' }}>
                          Sexo
                        </label>
                        <select
                          value={sex}
                          onChange={e => setSex(e.target.value as ProfileSex)}
                          className="w-full px-3.5 py-2.5 rounded-xl text-sm outline-none transition-all"
                          style={inputStyle}
                        >
                          <option value="female">Feminino</option>
                          <option value="male">Masculino</option>
                          <option value="unspecified">Prefiro não informar</option>
                        </select>
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
                  disabled={loading}
                  className="w-full py-3 rounded-xl text-sm font-bold text-white transition-all"
                  style={{
                    background: loading ? '#4A7A8A' : 'linear-gradient(135deg, #1F4E5F, #2E3A59)',
                    boxShadow: loading ? 'none' : '0 4px 16px rgba(31,78,95,0.25)',
                    cursor: loading ? 'wait' : 'pointer',
                  }}
                >
                  {buttonLabel}
                </button>
              </form>

              {tab === 'register' && (
                <p className="mt-4 text-center text-xs" style={{ color: '#94A3B8' }}>
                  Ao criar sua conta você concorda com nossos{' '}
                  <span style={{ color: '#1F4E5F', fontWeight: 600 }}>Termos de Uso</span>{' '}
                  e{' '}
                  <span style={{ color: '#1F4E5F', fontWeight: 600 }}>Política de Privacidade</span>.
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
                ? <>Já fez sua compra? <button onClick={() => switchTab('register')} className="font-semibold" style={{ color: '#1F4E5F' }}>Criar conta</button></>
                : <>Já tem conta? <button onClick={() => switchTab('login')} className="font-semibold" style={{ color: '#1F4E5F' }}>Entrar</button></>
              }
            </p>

            <p className="mt-3 text-center text-xs">
              <a
                href={waUrl('Olá! Preciso de ajuda para acessar o IncluiAI.')}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: '#94A3B8', textDecoration: 'none' }}
              >
                Precisa de ajuda?{' '}
                <span style={{ color: '#1F4E5F', fontWeight: 600 }}>Fale conosco pelo WhatsApp</span>
              </a>
            </p>
          </motion.div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          Modal: Compra não localizada / Erro de verificação
      ════════════════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {showPurchaseModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.48)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 9999,
              padding: 16,
            }}
            onClick={e => { if (e.target === e.currentTarget) handleReviseEmail(); }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2 }}
              style={{
                background: '#fff',
                borderRadius: 16,
                padding: '32px 28px 28px',
                width: '100%',
                maxWidth: 440,
                boxShadow: '0 24px 64px rgba(0,0,0,0.22)',
                position: 'relative',
              }}
            >
              {/* Botão fechar */}
              <button
                onClick={handleReviseEmail}
                aria-label="Fechar"
                style={{
                  position: 'absolute',
                  top: 14,
                  right: 14,
                  background: '#F3F4F6',
                  border: 'none',
                  borderRadius: 8,
                  width: 32,
                  height: 32,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: '#6B7280',
                }}
              >
                <X size={16} />
              </button>

              {/* Ícone de status */}
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: '50%',
                  background: purchaseModalType === 'not_found' ? '#FEE2E2' : '#FEF3C7',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 16,
                }}
              >
                <AlertCircle
                  size={26}
                  style={{ color: purchaseModalType === 'not_found' ? '#DC2626' : '#D97706' }}
                />
              </div>

              {/* Título */}
              <h2 style={{ fontWeight: 800, fontSize: 18, color: '#111827', margin: '0 0 10px' }}>
                {purchaseModalType === 'not_found'
                  ? 'Compra não localizada'
                  : 'Não foi possível verificar sua compra'
                }
              </h2>

              {/* Mensagem obrigatória */}
              <p style={{ fontSize: 14, color: '#374151', margin: '0 0 24px', lineHeight: 1.65 }}>
                {purchaseModalType === 'not_found'
                  ? 'Não encontramos uma compra aprovada para este e-mail. Use o mesmo e-mail informado no momento da compra pela Kiwify. Qualquer dúvida, entre em contato conosco pelo WhatsApp.'
                  : 'Não conseguimos consultar sua compra neste momento. Aguarde alguns instantes e tente novamente. Se precisar de ajuda, fale conosco pelo WhatsApp.'
                }
              </p>

              {/* Ações */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

                {/* Falar pelo WhatsApp */}
                <a
                  href={waUrl(WA_CADASTRO_MSG)}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 9,
                    background: '#25D366',
                    color: '#fff',
                    padding: '12px 20px',
                    borderRadius: 10,
                    textDecoration: 'none',
                    fontWeight: 700,
                    fontSize: 14,
                    boxShadow: '0 2px 10px rgba(37,211,102,0.28)',
                  }}
                >
                  <WaIcon size={18} />
                  Falar pelo WhatsApp
                </a>

                {/* Tentar novamente */}
                <button
                  onClick={handleReviseEmail}
                  style={{
                    background: '#F3F4F6',
                    color: '#374151',
                    padding: '12px 20px',
                    borderRadius: 10,
                    border: 'none',
                    fontWeight: 700,
                    fontSize: 14,
                    cursor: 'pointer',
                  }}
                >
                  Tentar novamente
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
