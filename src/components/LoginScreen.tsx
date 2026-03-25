import React, { useState } from 'react';
import { Brain, ShieldCheck, Users, Zap, Eye, EyeOff } from 'lucide-react';
import { motion } from 'framer-motion';
import { Card, CardContent } from '@/src/components/ui/card';
import { Input } from '@/src/components/ui/input';
import { Button } from '@/src/components/ui/button';

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
        className="hidden md:flex flex-col justify-between w-1/2 p-12 relative overflow-hidden"
        style={{ background: 'linear-gradient(160deg, #1F4E5F 0%, #2E3A59 100%)' }}
      >
        {/* subtle dot pattern */}
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

      {/* Right: login form */}
      <div className="flex flex-1 items-center justify-center p-8">
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

          <h1 className="text-2xl font-bold mb-1" style={{ color: '#2E3A59' }}>
            Bem-vindo de volta
          </h1>
          <p className="text-sm mb-8" style={{ color: '#667085' }}>
            Acesse sua conta para continuar
          </p>

          <Card className="border-border shadow-sm">
            <CardContent className="pt-6 pb-6 px-6">
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold" style={{ color: '#2E3A59' }}>
                    E-mail
                  </label>
                  <Input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="seu@email.com"
                    required
                    className="focus-visible:ring-petrol/30 focus-visible:border-petrol"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold" style={{ color: '#2E3A59' }}>
                    Senha
                  </label>
                  <div className="relative">
                    <Input
                      type={showPass ? 'text' : 'password'}
                      value={pass}
                      onChange={e => setPass(e.target.value)}
                      placeholder="••••••••"
                      required
                      className="pr-10 focus-visible:ring-petrol/30 focus-visible:border-petrol"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded text-gray-400 hover:text-gray-600 transition"
                    >
                      {showPass ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full font-semibold text-white"
                  style={{
                    background: loading
                      ? '#4A7A8A'
                      : 'linear-gradient(135deg, #1F4E5F, #2E3A59)',
                    boxShadow: '0 4px 16px rgba(31,78,95,0.22)',
                  }}
                >
                  {loading ? 'Entrando...' : 'Entrar na Plataforma'}
                </Button>
              </form>
            </CardContent>
          </Card>

          <div
            className="mt-5 rounded-xl p-4 text-xs leading-relaxed"
            style={{ background: '#FDF6E3', border: '1px solid #E7E2D8', color: '#667085' }}
          >
            <span className="font-semibold" style={{ color: '#C69214' }}>Primeiro acesso?</span>{' '}
            Entre em contato com o administrador da sua instituição para obter suas credenciais. Suas
            informações são protegidas conforme a LGPD.
          </div>
        </motion.div>
      </div>
    </div>
  );
};
