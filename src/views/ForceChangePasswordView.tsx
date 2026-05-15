import React, { useState } from 'react';
import { Lock, Eye, EyeOff, CheckCircle, ShieldAlert } from 'lucide-react';
import { supabase } from '../services/supabase';
import { BrandLogo } from '../components/BrandLogo';

interface Props {
  userId: string;
  userEmail: string;
  onPasswordChanged: () => void;
}

export const ForceChangePasswordView: React.FC<Props> = ({ userId, userEmail, onPasswordChanged }) => {
  const [newPassword, setNewPassword]         = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew]                 = useState(false);
  const [showConfirm, setShowConfirm]         = useState(false);
  const [loading, setLoading]                 = useState(false);
  const [error, setError]                     = useState<string | null>(null);
  const [done, setDone]                       = useState(false);

  const strength = (() => {
    if (newPassword.length === 0) return 0;
    let s = 0;
    if (newPassword.length >= 8)  s++;
    if (/[A-Z]/.test(newPassword)) s++;
    if (/[0-9]/.test(newPassword)) s++;
    if (/[^A-Za-z0-9]/.test(newPassword)) s++;
    return s;
  })();

  const strengthLabel  = ['', 'Fraca', 'Razoável', 'Boa', 'Forte'][strength];
  const strengthColor  = ['', '#EF4444', '#F59E0B', '#3B82F6', '#10B981'][strength];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

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
      // Usuário está logado — pode usar updateUser diretamente (sem service_role)
      const { error: authErr } = await supabase.auth.updateUser({ password: newPassword });
      if (authErr) throw authErr;

      // Limpa a flag e registra o timestamp
      await supabase
        .from('users')
        .update({
          must_change_password: false,
          password_changed_at:  new Date().toISOString(),
        })
        .eq('id', userId);

      // Auditoria
      await supabase.from('audit_logs').insert({
        user_id:     userId,
        action:      'PASSWORD_CHANGED_BY_USER',
        entity_type: 'users',
        entity_id:   userId,
        details:     { source: 'forced_change_on_login' },
      });

      setDone(true);
      setTimeout(() => onPasswordChanged(), 2000);

    } catch (err: any) {
      setError(err.message ?? 'Erro ao atualizar senha. Tente novamente.');
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
          <BrandLogo iconSize={28} fontSize={22} />
        </div>

        {done ? (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <CheckCircle size={52} color="#10B981" style={{ margin: '0 auto 16px' }} />
            <p style={{ fontWeight: 800, fontSize: 20, color: '#111827', margin: '0 0 8px' }}>
              Senha criada com sucesso!
            </p>
            <p style={{ color: '#6B7280', fontSize: 14 }}>Redirecionando para o sistema…</p>
          </div>
        ) : (
          <>
            {/* Banner de aviso */}
            <div style={{
              background: '#FEF3C7',
              border: '1px solid #FCD34D',
              borderRadius: 12,
              padding: '12px 16px',
              display: 'flex',
              gap: 10,
              alignItems: 'flex-start',
              marginBottom: 24,
            }}>
              <ShieldAlert size={18} color="#D97706" style={{ flexShrink: 0, marginTop: 1 }} />
              <div>
                <p style={{ fontWeight: 700, fontSize: 13, color: '#92400E', margin: '0 0 2px' }}>
                  Troca de senha obrigatória
                </p>
                <p style={{ fontSize: 12, color: '#78350F', margin: 0 }}>
                  Por segurança, crie uma nova senha pessoal antes de continuar.
                  A senha atual é temporária e não pode ser mantida.
                </p>
              </div>
            </div>

            <p style={{ fontSize: 13, color: '#6B7280', marginBottom: 20 }}>
              Conta: <strong style={{ color: '#111827' }}>{userEmail}</strong>
            </p>

            <form onSubmit={handleSubmit}>
              {/* Nova senha */}
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Nova senha</label>
                <div style={{ position: 'relative' }}>
                  <Lock size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF' }} />
                  <input
                    type={showNew ? 'text' : 'password'}
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="Mínimo 8 caracteres"
                    required
                    autoFocus
                    style={inputStyle}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNew(v => !v)}
                    style={eyeBtn}
                  >
                    {showNew ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>

                {/* Indicador de força */}
                {newPassword.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {[1, 2, 3, 4].map(i => (
                        <div key={i} style={{
                          height: 4, flex: 1, borderRadius: 2,
                          background: strength >= i ? strengthColor : '#E5E7EB',
                          transition: 'background 0.2s',
                        }} />
                      ))}
                    </div>
                    <p style={{ fontSize: 11, color: strengthColor, marginTop: 4 }}>
                      Força: {strengthLabel}
                    </p>
                  </div>
                )}
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
                    style={{
                      ...inputStyle,
                      borderColor: confirmPassword && newPassword !== confirmPassword ? '#EF4444' : '#D1D5DB',
                    }}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(v => !v)}
                    style={eyeBtn}
                  >
                    {showConfirm ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                {confirmPassword && newPassword !== confirmPassword && (
                  <p style={{ fontSize: 11, color: '#EF4444', marginTop: 4 }}>As senhas não coincidem.</p>
                )}
              </div>

              {error && (
                <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>
                  <p style={{ fontSize: 13, color: '#DC2626', margin: 0 }}>{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: 10,
                  border: 'none',
                  background: loading ? '#9CA3AF' : '#1F4E5F',
                  color: 'white',
                  fontWeight: 700,
                  fontSize: 15,
                  cursor: loading ? 'not-allowed' : 'pointer',
                }}
              >
                {loading ? 'Salvando...' : 'Criar nova senha'}
              </button>
            </form>
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
