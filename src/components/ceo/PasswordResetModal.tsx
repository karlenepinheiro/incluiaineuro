import React, { useState } from 'react';
import { Lock, Eye, EyeOff, X, ShieldAlert, CheckCircle } from 'lucide-react';
import { supabase, DEMO_MODE } from '../../services/supabase';
import type { AdminUser } from '../../types';

const SUPABASE_URL = (import.meta as any).env?.VITE_SUPABASE_URL as string | undefined;

interface Props {
  targetEmail: string;
  targetName: string;
  adminUser: AdminUser;
  onClose: () => void;
  onSuccess: () => void;
}

export const PasswordResetModal: React.FC<Props> = ({
  targetEmail,
  targetName,
  adminUser,
  onClose,
  onSuccess,
}) => {
  const [newPassword, setNewPassword]         = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew]                 = useState(false);
  const [showConfirm, setShowConfirm]         = useState(false);
  const [mustChange, setMustChange]           = useState(true);
  const [loading, setLoading]                 = useState(false);
  const [error, setError]                     = useState<string | null>(null);
  const [done, setDone]                       = useState(false);

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
      if (DEMO_MODE || !SUPABASE_URL) {
        // Em modo DEMO, simula o reset sem chamada real
        await new Promise(r => setTimeout(r, 800));
        setDone(true);
        setTimeout(() => onSuccess(), 1500);
        return;
      }

      // Obtém o JWT do usuário CEO autenticado
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Sessão expirada. Faça login novamente.');

      const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-reset-password`, {
        method: 'POST',
        headers: {
          'Authorization':  `Bearer ${session.access_token}`,
          'Content-Type':   'application/json',
        },
        body: JSON.stringify({
          targetEmail,
          newPassword,
          mustChangePassword: mustChange,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error ?? 'Erro ao redefinir senha.');
      }

      setDone(true);
      setTimeout(() => onSuccess(), 1500);

    } catch (err: any) {
      setError(err.message ?? 'Erro inesperado. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div style={overlay}>
        <div style={modal}>
          <div style={{ textAlign: 'center', padding: '32px 24px' }}>
            <CheckCircle size={48} color="#10B981" style={{ margin: '0 auto 16px' }} />
            <p style={{ fontWeight: 700, fontSize: 18, color: '#111827' }}>Senha redefinida!</p>
            <p style={{ color: '#6B7280', fontSize: 14, marginTop: 8 }}>
              {mustChange
                ? 'A usuária deverá criar uma nova senha no próximo acesso.'
                : 'A nova senha foi aplicada imediatamente.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={modal}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <ShieldAlert size={20} color="#DC2626" />
            <span style={{ fontWeight: 700, fontSize: 16, color: '#111827' }}>Redefinir Senha</span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF' }}>
            <X size={20} />
          </button>
        </div>

        {/* Info da usuária */}
        <div style={{ background: '#F9FAFB', borderRadius: 10, padding: '12px 16px', marginBottom: 20, border: '1px solid #E5E7EB' }}>
          <p style={{ fontWeight: 700, fontSize: 14, color: '#111827', margin: 0 }}>{targetName}</p>
          <p style={{ fontSize: 12, color: '#6B7280', margin: '2px 0 0' }}>{targetEmail}</p>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Nova senha */}
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Nova senha temporária</label>
            <div style={{ position: 'relative' }}>
              <Lock size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF' }} />
              <input
                type={showNew ? 'text' : 'password'}
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="Mínimo 8 caracteres"
                required
                style={inputStyle}
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowNew(v => !v)}
                style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF' }}
              >
                {showNew ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          {/* Confirmar senha */}
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Confirmar nova senha</label>
            <div style={{ position: 'relative' }}>
              <Lock size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF' }} />
              <input
                type={showConfirm ? 'text' : 'password'}
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Repita a senha"
                required
                style={inputStyle}
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowConfirm(v => !v)}
                style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF' }}
              >
                {showConfirm ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          {/* Checkbox obrigar troca */}
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', marginBottom: 20 }}>
            <input
              type="checkbox"
              checked={mustChange}
              onChange={e => setMustChange(e.target.checked)}
              style={{ marginTop: 3, accentColor: '#DC2626' }}
            />
            <span style={{ fontSize: 13, color: '#374151' }}>
              Obrigar troca de senha no próximo acesso
              <span style={{ display: 'block', fontSize: 11, color: '#9CA3AF', marginTop: 1 }}>
                A usuária não conseguirá usar o sistema enquanto não criar uma nova senha.
              </span>
            </span>
          </label>

          {error && (
            <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 8, padding: '10px 14px', marginBottom: 14 }}>
              <p style={{ fontSize: 13, color: '#DC2626', margin: 0 }}>{error}</p>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onClose}
              style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid #E5E7EB', background: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#374151' }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: loading ? '#9CA3AF' : '#DC2626', color: 'white', fontSize: 13, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer' }}
            >
              {loading ? 'Aplicando...' : 'Redefinir senha'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0,
  background: 'rgba(0,0,0,0.45)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  zIndex: 9999,
};

const modal: React.CSSProperties = {
  background: 'white',
  borderRadius: 16,
  padding: 24,
  width: '100%',
  maxWidth: 440,
  boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 600,
  color: '#374151',
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  paddingLeft: 36,
  paddingRight: 36,
  paddingTop: 9,
  paddingBottom: 9,
  border: '1px solid #D1D5DB',
  borderRadius: 8,
  fontSize: 14,
  outline: 'none',
  boxSizing: 'border-box',
};
