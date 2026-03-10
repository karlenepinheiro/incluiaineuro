import React, { useState } from 'react';
import { Brain, ShieldCheck, Users, Zap, Eye, EyeOff } from 'lucide-react';

interface LoginScreenProps {
  onLogin: (email: string, pass: string) => void;
  onGuest: () => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !pass.trim()) return;
    setLoading(true);
    try {
      await onLogin(email, pass);
    } finally {
      setLoading(false);
    }
  };

  const features = [
    { icon: Brain, text: 'Geração de documentos com IA especializada em educação inclusiva' },
    { icon: Users, text: 'Gestão completa de alunos neurodivergentes e em triagem' },
    { icon: Zap, text: 'PEI, PAEE, PDI e Estudo de Caso em minutos' },
    { icon: ShieldCheck, text: 'Laudos com código de auditoria e conformidade LGPD' },
  ];

  return (
    <div className="min-h-screen flex" style={{ background: '#F6F4EF' }}>
      {/* Left: features panel */}
      <div
        className="hidden md:flex flex-col justify-between w-1/2 p-12"
        style={{ background: '#1F4E5F' }}
      >
        <div>
          <div className="flex items-center gap-3 mb-14">
            <div className="bg-white/10 p-2.5 rounded-xl">
              <Brain className="text-white h-7 w-7" />
            </div>
            <span className="text-2xl font-bold text-white tracking-tight">IncluiAI</span>
          </div>

          <h2 className="text-3xl font-bold text-white leading-tight mb-4">
            Tecnologia que inclui.<br />
            <span style={{ color: '#C69214' }}>Documentação que transforma.</span>
          </h2>
          <p className="text-white/70 text-base mb-10 leading-relaxed">
            A plataforma de IA para educadores e clínicos que atuam com estudantes neurodivergentes.
          </p>

          <div className="space-y-5">
            {features.map(({ icon: Icon, text }, i) => (
              <div key={i} className="flex items-start gap-4">
                <div className="rounded-lg p-2 shrink-0" style={{ background: 'rgba(198,146,20,0.15)' }}>
                  <Icon size={18} style={{ color: '#C69214' }} />
                </div>
                <p className="text-white/80 text-sm leading-relaxed">{text}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="text-white/40 text-xs">
          &copy; {new Date().getFullYear()} IncluiAI — Todos os direitos reservados
        </p>
      </div>

      {/* Right: login form */}
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="flex items-center gap-2 mb-8 md:hidden">
            <div className="p-2 rounded-lg" style={{ background: '#1F4E5F' }}>
              <Brain className="text-white h-5 w-5" />
            </div>
            <span className="text-xl font-bold" style={{ color: '#1F4E5F' }}>IncluiAI</span>
          </div>

          <h1 className="text-2xl font-bold mb-1" style={{ color: '#2E3A59' }}>
            Bem-vindo de volta
          </h1>
          <p className="text-sm mb-8" style={{ color: '#667085' }}>
            Acesse sua conta para continuar
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold mb-1.5" style={{ color: '#2E3A59' }}>
                E-mail
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="seu@email.com"
                required
                className="w-full rounded-xl px-4 py-3 text-sm outline-none transition"
                style={{
                  border: '1.5px solid #E7E2D8',
                  background: '#FFFFFF',
                  color: '#1F2937',
                }}
                onFocus={e => (e.currentTarget.style.borderColor = '#1F4E5F')}
                onBlur={e => (e.currentTarget.style.borderColor = '#E7E2D8')}
              />
            </div>

            <div>
              <label className="block text-sm font-semibold mb-1.5" style={{ color: '#2E3A59' }}>
                Senha
              </label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  value={pass}
                  onChange={e => setPass(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full rounded-xl px-4 py-3 text-sm outline-none transition pr-12"
                  style={{
                    border: '1.5px solid #E7E2D8',
                    background: '#FFFFFF',
                    color: '#1F2937',
                  }}
                  onFocus={e => (e.currentTarget.style.borderColor = '#1F4E5F')}
                  onBlur={e => (e.currentTarget.style.borderColor = '#E7E2D8')}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded transition"
                  style={{ color: '#667085' }}
                >
                  {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl py-3 font-bold text-sm text-white transition"
              style={{
                background: loading ? '#4A7A8A' : '#1F4E5F',
                boxShadow: '0 4px 16px rgba(31,78,95,0.25)',
              }}
            >
              {loading ? 'Entrando...' : 'Entrar na Plataforma'}
            </button>
          </form>

          <div
            className="mt-8 rounded-xl p-4 text-xs leading-relaxed"
            style={{ background: '#FDF6E3', border: '1px solid #E7E2D8', color: '#667085' }}
          >
            <span className="font-semibold" style={{ color: '#C69214' }}>Primeiro acesso?</span>{' '}
            Entre em contato com o administrador da sua instituição para obter suas credenciais. Suas
            informações são protegidas conforme a LGPD.
          </div>
        </div>
      </div>
    </div>
  );
};
