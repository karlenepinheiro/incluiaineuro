import React, { useState } from 'react';
import { Brain, ShieldCheck, Users, Zap, Eye, EyeOff, AlertCircle, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// ── Google icon SVG inline (sem dependência extra) ────────────────────────────
const GoogleIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
);

export interface AuthScreenProps {
  onLogin: (email: string, pass: string) => Promise<void>;
  onRegister: (name: string, email: string, pass: string) => Promise<void>;
  onGoogleLogin: () => Promise<void>;
  onGuest?: () => void;
  /** Quando definido, exibe aviso de que precisa de conta para fazer upgrade */
  pendingPlanLabel?: string;
}

export const LoginScreen: React.FC<AuthScreenProps> = ({
  onLogin,
  onRegister,
  onGoogleLogin,
  pendingPlanLabel,
}) => {
  const [tab, setTab]               = useState<'login' | 'register'>(pendingPlanLabel ? 'register' : 'login');
  const [name, setName]             = useState('');
  const [email, setEmail]           = useState('');
  const [pass, setPass]             = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [showPass, setShowPass]     = useState(false);
  const [loading, setLoading]       = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError]           = useState('');
  const [success, setSuccess]       = useState('');

  const resetFields = () => { setName(''); setEmail(''); setPass(''); setConfirmPass(''); setError(''); setSuccess(''); };

  const switchTab = (t: 'login' | 'register') => { setTab(t); resetFields(); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!email.trim() || !pass.trim()) { setError('Preencha e-mail e senha.'); return; }

    if (tab === 'register') {
      if (!name.trim())        { setError('Informe seu nome completo.'); return; }
      if (pass.length < 6)     { setError('A senha deve ter pelo menos 6 caracteres.'); return; }
      if (pass !== confirmPass) { setError('As senhas não coincidem.'); return; }
    }

    setLoading(true);
    try {
      if (tab === 'login') {
        await onLogin(email.trim(), pass);
      } else {
        await onRegister(name.trim(), email.trim(), pass);
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
      // A página redireciona para Google — não precisa fazer nada mais aqui
    } catch (err: any) {
      setError(err?.message || 'Erro ao conectar com Google.');
      setGoogleLoading(false);
    }
  };

  const features = [
    { icon: Brain,      text: 'Geração de PEI, PAEE e PDI com IA especializada em educação inclusiva' },
    { icon: Users,      text: 'Gestão completa de alunos neurodivergentes e em triagem' },
    { icon: Zap,        text: 'IncluiLab: ilustrações pedagógicas geradas por IA em segundos' },
    { icon: ShieldCheck,text: 'Documentos com código de auditoria SHA-256 e conformidade LGPD' },
  ];

  return (
    <div className="min-h-screen flex" style={{ background: '#F6F4EF' }}>

      {/* ── Painel esquerdo ── */}
      <div
        className="hidden md:flex flex-col justify-between w-[46%] p-12 relative overflow-hidden"
        style={{ background: 'linear-gradient(160deg, #1F4E5F 0%, #2E3A59 100%)' }}
      >
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
            backgroundSize: '28px 28px',
          }}
        />

        <div className="relative z-10">
          <motion.div
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="flex items-center gap-3 mb-14"
          >
            <div className="bg-white/10 p-2.5 rounded-xl border border-white/10">
              <Brain className="text-white h-7 w-7" />
            </div>
            <span className="text-2xl font-bold text-white tracking-tight">IncluiAI</span>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <h2 className="text-3xl font-bold text-white leading-tight mb-4">
              Tecnologia que inclui.<br />
              <span style={{ color: '#C69214' }}>Documentação que transforma.</span>
            </h2>
            <p className="text-white/70 text-base mb-10 leading-relaxed">
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
                <div className="rounded-lg p-2 shrink-0" style={{ background: 'rgba(198,146,20,0.18)' }}>
                  <Icon size={18} style={{ color: '#C69214' }} />
                </div>
                <p className="text-white/80 text-sm leading-relaxed">{text}</p>
              </motion.div>
            ))}
          </div>
        </div>

        <p className="relative z-10 text-white/35 text-xs">
          &copy; {new Date().getFullYear()} IncluiAI — Todos os direitos reservados
        </p>
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
          <div className="flex items-center gap-2 mb-8 md:hidden">
            <div className="p-2 rounded-lg" style={{ background: '#1F4E5F' }}>
              <Brain className="text-white h-5 w-5" />
            </div>
            <span className="text-xl font-bold" style={{ color: '#1F4E5F' }}>IncluiAI</span>
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
                      style={{
                        border: '1.5px solid #E7E2D8',
                        background: '#FAFAFA',
                        color: '#0F172A',
                      }}
                      onFocus={e => { (e.target as any).style.borderColor = '#1F4E5F'; }}
                      onBlur={e => { (e.target as any).style.borderColor = '#E7E2D8'; }}
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: '#2E3A59' }}>
                  E-mail
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl text-sm outline-none transition-all"
                  style={{ border: '1.5px solid #E7E2D8', background: '#FAFAFA', color: '#0F172A' }}
                  onFocus={e => { (e.target as any).style.borderColor = '#1F4E5F'; }}
                  onBlur={e => { (e.target as any).style.borderColor = '#E7E2D8'; }}
                />
              </div>

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
                    style={{ border: '1.5px solid #E7E2D8', background: '#FAFAFA', color: '#0F172A' }}
                    onFocus={e => { (e.target as any).style.borderColor = '#1F4E5F'; }}
                    onBlur={e => { (e.target as any).style.borderColor = '#E7E2D8'; }}
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
                      style={{ border: '1.5px solid #E7E2D8', background: '#FAFAFA', color: '#0F172A' }}
                      onFocus={e => { (e.target as any).style.borderColor = '#1F4E5F'; }}
                      onBlur={e => { (e.target as any).style.borderColor = '#E7E2D8'; }}
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Erro */}
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
              <p className="mt-4 text-center text-xs" style={{ color: '#94A3B8' }}>
                Suas informações são protegidas conforme a{' '}
                <span style={{ color: '#1F4E5F', fontWeight: 600 }}>LGPD</span>.
              </p>
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
