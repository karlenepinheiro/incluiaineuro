import React, { useState } from 'react';
import { Mail, Phone, Lock, Eye, EyeOff, CheckCircle, ArrowLeft, ShieldCheck, MessageCircle, AlertTriangle } from 'lucide-react';
import { DEMO_MODE } from '../services/supabase';
import { BrandLogo } from '../components/BrandLogo';
import { waUrl } from '../config/contact';

const SUPABASE_URL = (import.meta as any).env?.VITE_SUPABASE_URL as string | undefined;

interface Props {
  onBack: () => void;
}

type Step = 'identity' | 'verify' | 'done';

export const ForgotPasswordView: React.FC<Props> = ({ onBack }) => {
  const [step, setStep]                       = useState<Step>('identity');
  const [email, setEmail]                     = useState('');
  const [verifyType, setVerifyType]           = useState<'phone' | 'cpf'>('phone');
  const [verifyValue, setVerifyValue]         = useState('');
  const [newPassword, setNewPassword]         = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew]                 = useState(false);
  const [showConfirm, setShowConfirm]         = useState(false);
  const [loading, setLoading]                 = useState(false);
  const [error, setError]                     = useState<string | null>(null);
  const [showNoDataFallback, setShowNoDataFallback] = useState(false);

  const GENERIC_ERROR = 'Verificação falhou. Confira os dados e tente novamente.';

  const handleIdentityNext = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim()) { setError('Informe seu e-mail.'); return; }
    setStep('verify');
  };

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!verifyValue.trim()) {
      setError(`Informe seu ${verifyType === 'phone' ? 'telefone' : 'CPF'}.`);
      return;
    }
    if (newPassword.length < 8) {
      setError('A senha deve ter no mínimo 8 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }

    setLoading(true);
    try {
      if (DEMO_MODE || !SUPABASE_URL) {
        // Em DEMO, simula verificação bem-sucedida
        await new Promise(r => setTimeout(r, 1000));
        setStep('done');
        return;
      }

      const body: Record<string, string> = {
        email:       email.trim().toLowerCase(),
        newPassword,
      };
      if (verifyType === 'phone') body.phone = verifyValue.trim();
      else body.cpf = verifyValue.trim();

      const res = await fetch(`${SUPABASE_URL}/functions/v1/self-reset-password`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });

      const data = await res.json();

      if (res.status === 429) {
        setError(data.error ?? 'Muitas tentativas. Aguarde 1 hora.');
        return;
      }
      if (!res.ok || !data.success) {
        setError(GENERIC_ERROR);
        return;
      }

      setStep('done');

    } catch {
      setError(GENERIC_ERROR);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #F6F4EF 0%, #EAE6DC 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{
        background: 'white',
        borderRadius: 20,
        padding: '40px 36px',
        width: '100%',
        maxWidth: 440,
        boxShadow: '0 20px 60px rgba(0,0,0,0.12)',
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <BrandLogo iconSize={24} fontSize={20} />
        </div>

        {step === 'done' ? (
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <CheckCircle size={52} color="#10B981" style={{ margin: '0 auto 16px' }} />
            <p style={{ fontWeight: 800, fontSize: 20, color: '#111827', margin: '0 0 10px' }}>
              Senha redefinida!
            </p>
            <p style={{ color: '#6B7280', fontSize: 14, marginBottom: 28 }}>
              Sua nova senha foi salva com sucesso. Faça login normalmente.
            </p>
            <button
              onClick={onBack}
              style={{
                padding: '11px 28px',
                borderRadius: 10,
                border: 'none',
                background: '#1F4E5F',
                color: 'white',
                fontWeight: 700,
                fontSize: 14,
                cursor: 'pointer',
              }}
            >
              Ir para o login
            </button>
          </div>
        ) : (
          <>
            <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: '#6B7280', cursor: 'pointer', fontSize: 13, marginBottom: 20, padding: 0 }}>
              <ArrowLeft size={14} /> Voltar ao login
            </button>

            <h2 style={{ fontWeight: 800, fontSize: 20, color: '#111827', margin: '0 0 6px' }}>
              Recuperar acesso
            </h2>
            <p style={{ fontSize: 13, color: '#6B7280', margin: '0 0 24px' }}>
              Sem envio de e-mail. Verificamos sua identidade pelos dados cadastrados.
            </p>

            {/* Indicador de passos */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 28 }}>
              {(['identity', 'verify'] as Step[]).map((s, i) => (
                <div key={s} style={{
                  flex: 1, height: 4, borderRadius: 2,
                  background: step === 'identity' && i === 0
                    ? '#1F4E5F'
                    : step === 'verify'
                    ? '#1F4E5F'
                    : '#E5E7EB',
                }} />
              ))}
            </div>

            {step === 'identity' && (
              <form onSubmit={handleIdentityNext}>
                <div style={{ marginBottom: 20 }}>
                  <label style={labelStyle}>Seu e-mail</label>
                  <div style={{ position: 'relative' }}>
                    <Mail size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF' }} />
                    <input
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="você@escola.com"
                      required
                      autoFocus
                      style={inputStyle}
                      autoComplete="email"
                    />
                  </div>
                </div>

                {error && <p style={errorStyle}>{error}</p>}

                <button type="submit" style={primaryBtn}>
                  Continuar
                </button>
              </form>
            )}

            {step === 'verify' && (
              <form onSubmit={handleResetSubmit}>
                <p style={{ fontSize: 12, color: '#6B7280', marginBottom: 16 }}>
                  E-mail: <strong style={{ color: '#111827' }}>{email}</strong>
                </p>

                {/* Tipo de verificação */}
                <div style={{ marginBottom: 16 }}>
                  <label style={labelStyle}>Verificar usando</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {[
                      { value: 'phone', label: 'Telefone' },
                      { value: 'cpf',   label: 'CPF' },
                    ].map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => { setVerifyType(opt.value as 'phone' | 'cpf'); setVerifyValue(''); }}
                        style={{
                          flex: 1, padding: '8px', borderRadius: 8,
                          border: `2px solid ${verifyType === opt.value ? '#1F4E5F' : '#E5E7EB'}`,
                          background: verifyType === opt.value ? '#EFF6FF' : 'white',
                          color: verifyType === opt.value ? '#1F4E5F' : '#6B7280',
                          fontWeight: 600, fontSize: 13, cursor: 'pointer',
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Campo de verificação */}
                <div style={{ marginBottom: 16 }}>
                  <label style={labelStyle}>
                    {verifyType === 'phone' ? 'Telefone cadastrado' : 'CPF cadastrado'}
                  </label>
                  <div style={{ position: 'relative' }}>
                    <Phone size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF' }} />
                    <input
                      type="text"
                      value={verifyValue}
                      onChange={e => setVerifyValue(e.target.value)}
                      placeholder={verifyType === 'phone' ? '(11) 99999-9999' : '000.000.000-00'}
                      required
                      autoFocus
                      style={inputStyle}
                    />
                  </div>
                </div>

                {/* Nova senha */}
                <div style={{ marginBottom: 14 }}>
                  <label style={labelStyle}>Nova senha</label>
                  <div style={{ position: 'relative' }}>
                    <Lock size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF' }} />
                    <input
                      type={showNew ? 'text' : 'password'}
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      placeholder="Mínimo 8 caracteres"
                      required
                      style={inputStyle}
                      autoComplete="new-password"
                    />
                    <button type="button" onClick={() => setShowNew(v => !v)} style={eyeBtn}>
                      {showNew ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>

                {/* Confirmar senha */}
                <div style={{ marginBottom: 20 }}>
                  <label style={labelStyle}>Confirmar nova senha</label>
                  <div style={{ position: 'relative' }}>
                    <Lock size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF' }} />
                    <input
                      type={showConfirm ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      placeholder="Repita a nova senha"
                      required
                      style={inputStyle}
                      autoComplete="new-password"
                    />
                    <button type="button" onClick={() => setShowConfirm(v => !v)} style={eyeBtn}>
                      {showConfirm ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>

                {/* Aviso de privacidade */}
                <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, padding: '8px 12px', display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 16 }}>
                  <ShieldCheck size={14} color="#16A34A" style={{ flexShrink: 0, marginTop: 1 }} />
                  <p style={{ fontSize: 11, color: '#166534', margin: 0 }}>
                    Seus dados são verificados com segurança. Nenhuma informação sensível é exibida ou transmitida.
                  </p>
                </div>

                {error && <p style={errorStyle}>{error}</p>}

                <button type="submit" disabled={loading} style={{ ...primaryBtn, background: loading ? '#9CA3AF' : '#1F4E5F', cursor: loading ? 'not-allowed' : 'pointer' }}>
                  {loading ? 'Verificando...' : 'Redefinir senha'}
                </button>

                {/* Fallback: usuária não tem esses dados cadastrados */}
                {!showNoDataFallback && (
                  <div style={{ marginTop: 16, textAlign: 'center' }}>
                    <button
                      type="button"
                      onClick={() => setShowNoDataFallback(true)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#6B7280', textDecoration: 'underline' }}
                    >
                      Não tenho esses dados cadastrados
                    </button>
                  </div>
                )}

                {showNoDataFallback && (
                  <div style={{
                    marginTop: 16,
                    background: '#FEF3C7',
                    border: '1px solid #FCD34D',
                    borderRadius: 10,
                    padding: '14px 16px',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 10 }}>
                      <AlertTriangle size={15} color="#D97706" style={{ flexShrink: 0, marginTop: 1 }} />
                      <p style={{ fontSize: 12, color: '#92400E', margin: 0, lineHeight: 1.5 }}>
                        <strong>Não foi possível recuperar automaticamente.</strong><br />
                        Sua conta não tem telefone ou CPF cadastrado. Entre em contato com o suporte pelo WhatsApp para redefinir sua senha com segurança.
                      </p>
                    </div>
                    <a
                      href={waUrl(`Olá! Preciso de ajuda para recuperar minha senha no IncluiAI. E-mail da conta: ${email}`)}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        background: '#25D366',
                        color: 'white',
                        borderRadius: 8,
                        padding: '8px 16px',
                        fontWeight: 700,
                        fontSize: 13,
                        textDecoration: 'none',
                      }}
                    >
                      <MessageCircle size={14} />
                      Falar com suporte via WhatsApp
                    </a>
                  </div>
                )}
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 600,
  color: '#374151',
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  paddingLeft: 38,
  paddingRight: 38,
  paddingTop: 10,
  paddingBottom: 10,
  border: '1px solid #D1D5DB',
  borderRadius: 9,
  fontSize: 14,
  outline: 'none',
  boxSizing: 'border-box',
};

const eyeBtn: React.CSSProperties = {
  position: 'absolute',
  right: 12,
  top: '50%',
  transform: 'translateY(-50%)',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: '#9CA3AF',
  padding: 0,
};

const primaryBtn: React.CSSProperties = {
  width: '100%',
  padding: '12px',
  borderRadius: 10,
  border: 'none',
  background: '#1F4E5F',
  color: 'white',
  fontWeight: 700,
  fontSize: 15,
  cursor: 'pointer',
};

const errorStyle: React.CSSProperties = {
  fontSize: 13,
  color: '#DC2626',
  background: '#FEF2F2',
  border: '1px solid #FCA5A5',
  borderRadius: 8,
  padding: '10px 14px',
  margin: '0 0 14px',
};
