// views/ProfessionalSignaturesView.tsx
// Gerenciamento de assinaturas internas da equipe (professional_signatures)
// Permite cadastrar, visualizar, substituir e ativar assinaturas digitais
import React, { useState, useEffect, useCallback } from 'react';
import { PenLine, Plus, Trash2, CheckCircle, RefreshCw, AlertCircle, User, Shield } from 'lucide-react';
import { SignaturePad } from '../components/SignaturePad';
import { supabase } from '../services/supabase';
import { User as UserType } from '../types';

const C = {
  petrol:  '#1F4E5F',
  dark:    '#2E3A59',
  gold:    '#C69214',
  bg:      '#F6F4EF',
  surface: '#FFFFFF',
  border:  '#E7E2D8',
};

interface ProfessionalSignature {
  id: string;
  tenant_id: string;
  user_id: string | null;
  signer_name: string;
  signer_role: string;
  signature_image_url: string | null;
  signature_data_b64: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const ROLE_LABELS: Record<string, string> = {
  professor_regente: 'Professor Regente',
  professor_aee:     'Professor AEE',
  coordenador:       'Coordenador(a)',
  gestor:            'Gestor(a)',
  pedagogo:          'Pedagogo(a)',
  psicologo:         'Psicólogo(a)',
  fonoaudiologo:     'Fonoaudiólogo(a)',
  terapeuta:         'Terapeuta Ocupacional',
  outro:             'Outro',
};

interface Props {
  user: UserType;
}

export const ProfessionalSignaturesView: React.FC<Props> = ({ user }) => {
  const [signatures, setSignatures] = useState<ProfessionalSignature[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Formulário novo
  const [showForm, setShowForm] = useState(false);
  const [signerName, setSignerName] = useState('');
  const [signerRole, setSignerRole] = useState('professor_regente');

  // SignaturePad modal
  const [showPad, setShowPad] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Dados temporários antes de salvar
  const [pendingName, setPendingName] = useState('');
  const [pendingRole, setPendingRole] = useState('professor_regente');

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 3500);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data, error: err } = await supabase
        .from('professional_signatures')
        .select('*')
        .order('created_at', { ascending: false });

      if (err) throw err;
      setSignatures((data ?? []) as ProfessionalSignature[]);
    } catch (e: any) {
      console.error('[ProfessionalSignaturesView] load error:', e);
      setError(e?.message || 'Erro ao carregar assinaturas.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Ativa/desativa uma assinatura (apenas uma por usuário pode estar ativa)
  const handleToggleActive = async (sig: ProfessionalSignature) => {
    try {
      if (!sig.is_active) {
        // Desativa todas as do mesmo user_id antes
        await supabase
          .from('professional_signatures')
          .update({ is_active: false })
          .eq('user_id', user.id);
      }
      await supabase
        .from('professional_signatures')
        .update({ is_active: !sig.is_active })
        .eq('id', sig.id);

      setSignatures(prev => prev.map(s => {
        if (s.user_id === user.id) return { ...s, is_active: false };
        return s;
      }).map(s => s.id === sig.id ? { ...s, is_active: !sig.is_active } : s));

      showSuccess(!sig.is_active ? 'Assinatura ativada.' : 'Assinatura desativada.');
    } catch (e: any) {
      setError(e?.message || 'Erro ao atualizar assinatura.');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Excluir esta assinatura permanentemente?')) return;
    try {
      const { error: err } = await supabase
        .from('professional_signatures')
        .delete()
        .eq('id', id);
      if (err) throw err;
      setSignatures(prev => prev.filter(s => s.id !== id));
      showSuccess('Assinatura excluída.');
    } catch (e: any) {
      setError(e?.message || 'Erro ao excluir.');
    }
  };

  // Fluxo: clicar em "Nova assinatura" → preencher nome+cargo → abrir SignaturePad → salvar
  const handleOpenNewSignature = () => {
    setPendingName(user.name || '');
    setPendingRole('professor_regente');
    setEditingId(null);
    setShowForm(true);
  };

  const handleOpenReplace = (sig: ProfessionalSignature) => {
    setPendingName(sig.signer_name);
    setPendingRole(sig.signer_role);
    setEditingId(sig.id);
    setShowPad(true);
  };

  const handleFormNext = () => {
    if (!pendingName.trim()) {
      setError('Informe o nome do profissional.');
      return;
    }
    setError('');
    setShowForm(false);
    setShowPad(true);
  };

  const handleSaveSignature = async (dataUrl: string) => {
    setShowPad(false);
    setError('');
    try {
      if (editingId) {
        // Substituir assinatura existente
        const { error: err } = await supabase
          .from('professional_signatures')
          .update({
            signer_name:       pendingName.trim(),
            signer_role:       pendingRole,
            signature_data_b64: dataUrl,
            signature_image_url: null, // limpa URL de storage (ainda não implementado)
            updated_at:        new Date().toISOString(),
          })
          .eq('id', editingId);
        if (err) throw err;
        showSuccess('Assinatura substituída com sucesso!');
      } else {
        // Nova assinatura — desativa outras do mesmo user antes
        await supabase
          .from('professional_signatures')
          .update({ is_active: false })
          .eq('user_id', user.id);

        const { error: err } = await supabase
          .from('professional_signatures')
          .insert({
            tenant_id:         user.tenant_id,
            user_id:           user.id,
            signer_name:       pendingName.trim(),
            signer_role:       pendingRole,
            signature_data_b64: dataUrl,
            signature_image_url: null,
            is_active:         true,
          });
        if (err) throw err;
        showSuccess('Assinatura cadastrada e ativada!');
      }
      await load();
    } catch (e: any) {
      console.error('[ProfessionalSignaturesView] save error:', e);
      setError(e?.message || 'Erro ao salvar assinatura.');
    }
    setEditingId(null);
    setPendingName('');
  };

  const mySignatures = signatures.filter(s => s.user_id === user.id);
  const otherSignatures = signatures.filter(s => s.user_id !== user.id);

  return (
    <div className="max-w-3xl mx-auto py-6 px-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: C.dark }}>
            Assinaturas da Equipe
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Gerencie as assinaturas digitais dos profissionais. A assinatura ativa é usada automaticamente nos documentos gerados.
          </p>
        </div>
        <button
          onClick={handleOpenNewSignature}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-bold shadow transition hover:opacity-90"
          style={{ background: C.petrol }}
        >
          <Plus size={16} /> Nova Assinatura
        </button>
      </div>

      {/* Mensagens */}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
          <AlertCircle size={16} /> {error}
        </div>
      )}
      {successMsg && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl p-3 text-sm text-green-700">
          <CheckCircle size={16} /> {successMsg}
        </div>
      )}

      {/* Carregando */}
      {loading && (
        <div className="flex items-center gap-2 text-gray-500 py-8 justify-center">
          <RefreshCw size={18} className="animate-spin" /> Carregando assinaturas...
        </div>
      )}

      {/* Minhas assinaturas */}
      {!loading && (
        <>
          <Section title="Minhas Assinaturas" icon={<User size={16} />}>
            {mySignatures.length === 0 ? (
              <EmptyState
                label="Você ainda não tem assinaturas cadastradas."
                action={
                  <button
                    onClick={handleOpenNewSignature}
                    className="text-sm font-bold underline"
                    style={{ color: C.petrol }}
                  >
                    Cadastrar agora
                  </button>
                }
              />
            ) : (
              <div className="space-y-3">
                {mySignatures.map(sig => (
                  <SignatureCard
                    key={sig.id}
                    sig={sig}
                    isOwn
                    onToggleActive={() => handleToggleActive(sig)}
                    onReplace={() => handleOpenReplace(sig)}
                    onDelete={() => handleDelete(sig.id)}
                  />
                ))}
              </div>
            )}
          </Section>

          {/* Assinaturas da equipe */}
          {otherSignatures.length > 0 && (
            <Section title="Assinaturas da Equipe" icon={<Shield size={16} />}>
              <p className="text-xs text-gray-400 mb-3">
                Assinaturas cadastradas por outros profissionais do seu tenant. Apenas leitura.
              </p>
              <div className="space-y-3">
                {otherSignatures.map(sig => (
                  <SignatureCard
                    key={sig.id}
                    sig={sig}
                    isOwn={false}
                    onToggleActive={() => {}}
                    onReplace={() => {}}
                    onDelete={() => {}}
                  />
                ))}
              </div>
            </Section>
          )}
        </>
      )}

      {/* Modal: formulário nome + cargo */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-800">Dados do Profissional</h3>
              <button onClick={() => setShowForm(false)} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Nome completo *</label>
                <input
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1F4E5F]/25"
                  value={pendingName}
                  onChange={e => setPendingName(e.target.value)}
                  placeholder="Nome como deve aparecer no documento"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Cargo / Função *</label>
                <select
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1F4E5F]/25"
                  value={pendingRole}
                  onChange={e => setPendingRole(e.target.value)}
                >
                  {Object.entries(ROLE_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
              {error && <p className="text-xs text-red-600">{error}</p>}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowForm(false)}
                  className="flex-1 border border-gray-200 rounded-xl py-2.5 text-sm text-gray-600 font-medium hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleFormNext}
                  className="flex-1 rounded-xl py-2.5 text-sm text-white font-bold"
                  style={{ background: C.petrol }}
                >
                  Próximo: Assinar →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SignaturePad */}
      {showPad && (
        <SignaturePad
          signerName={pendingName}
          documentTitle="Assinatura profissional — IncluiAI"
          onSave={handleSaveSignature}
          onCancel={() => {
            setShowPad(false);
            setEditingId(null);
          }}
        />
      )}
    </div>
  );
};

// ─── Sub-componentes ──────────────────────────────────────────────────────────

const Section: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode }> = ({
  title, icon, children,
}) => (
  <div className="bg-white rounded-2xl border p-5 space-y-4" style={{ borderColor: '#E7E2D8' }}>
    <div className="flex items-center gap-2 text-sm font-bold text-gray-700">
      {icon} {title}
    </div>
    {children}
  </div>
);

const EmptyState: React.FC<{ label: string; action?: React.ReactNode }> = ({ label, action }) => (
  <div className="text-center py-8 text-gray-400 text-sm space-y-2">
    <PenLine size={32} className="mx-auto opacity-30" />
    <p>{label}</p>
    {action}
  </div>
);

const SignatureCard: React.FC<{
  sig: ProfessionalSignature;
  isOwn: boolean;
  onToggleActive: () => void;
  onReplace: () => void;
  onDelete: () => void;
}> = ({ sig, isOwn, onToggleActive, onReplace, onDelete }) => {
  const imgSrc = sig.signature_data_b64 || sig.signature_image_url;

  return (
    <div
      className="flex items-start gap-4 p-4 rounded-xl border transition"
      style={{
        borderColor: sig.is_active ? '#1F4E5F' : '#E7E2D8',
        background: sig.is_active ? '#F0F7FA' : '#FAFAF8',
      }}
    >
      {/* Preview da assinatura */}
      <div
        className="w-36 h-16 rounded-lg border flex items-center justify-center shrink-0 bg-white overflow-hidden"
        style={{ borderColor: '#E7E2D8' }}
      >
        {imgSrc ? (
          <img src={imgSrc} alt="Assinatura" className="max-w-full max-h-full object-contain p-1" />
        ) : (
          <span className="text-xs text-gray-300">Sem imagem</span>
        )}
      </div>

      {/* Dados */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold text-sm text-gray-800 truncate">{sig.signer_name}</span>
          {sig.is_active && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#1F4E5F] text-white">
              ATIVA
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500 mt-0.5">
          {ROLE_LABELS[sig.signer_role] ?? sig.signer_role}
        </p>
        <p className="text-[10px] text-gray-400 mt-1">
          Criada: {new Date(sig.created_at).toLocaleDateString('pt-BR')}
        </p>
      </div>

      {/* Ações (apenas próprias) */}
      {isOwn && (
        <div className="flex flex-col gap-1.5 shrink-0">
          <button
            onClick={onToggleActive}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold border transition"
            style={
              sig.is_active
                ? { borderColor: '#E7E2D8', color: '#6B7280', background: '#F9F9F9' }
                : { borderColor: '#1F4E5F', color: '#1F4E5F', background: '#F0F7FA' }
            }
          >
            <CheckCircle size={11} />
            {sig.is_active ? 'Desativar' : 'Ativar'}
          </button>
          <button
            onClick={onReplace}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold border border-gray-200 text-gray-600 hover:bg-gray-50 transition"
          >
            <PenLine size={11} /> Substituir
          </button>
          <button
            onClick={onDelete}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold border border-red-100 text-red-500 hover:bg-red-50 transition"
          >
            <Trash2 size={11} /> Excluir
          </button>
        </div>
      )}
    </div>
  );
};

export default ProfessionalSignaturesView;
