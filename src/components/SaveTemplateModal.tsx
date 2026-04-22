/**
 * SaveTemplateModal.tsx
 * Modal simples para nomear e salvar um modelo personalizado de documento.
 */

import React, { useState } from 'react';
import { X, BookMarked, Star, Loader } from 'lucide-react';
import { UserDocTemplateType } from '../types';

const C = {
  petrol:  '#1F4E5F',
  dark:    '#2E3A59',
  gold:    '#C69214',
  bg:      '#F6F4EF',
  surface: '#FFFFFF',
  border:  '#E7E2D8',
  muted:   '#6B7280',
};

const DOC_TYPE_LABEL: Record<UserDocTemplateType, string> = {
  ESTUDO_CASO: 'Estudo de Caso',
  PEI:         'PEI',
};

interface SaveTemplateModalProps {
  docType: UserDocTemplateType;
  onSave: (name: string, description: string, isDefault: boolean) => Promise<void>;
  onClose: () => void;
}

export const SaveTemplateModal: React.FC<SaveTemplateModalProps> = ({
  docType,
  onSave,
  onClose,
}) => {
  const [name, setName]             = useState('');
  const [description, setDescription] = useState('');
  const [isDefault, setIsDefault]   = useState(false);
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState<string | null>(null);

  const handleSave = async () => {
    if (!name.trim()) { setError('Informe um nome para o modelo.'); return; }
    setSaving(true);
    setError(null);
    try {
      await onSave(name.trim(), description.trim(), isDefault);
    } catch (e: any) {
      setError(e?.message || 'Erro ao salvar modelo. Tente novamente.');
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 11000,
        background: 'rgba(30,46,80,0.6)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: C.surface, borderRadius: 20, width: '100%', maxWidth: 480,
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)', overflow: 'hidden',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: '20px 24px 16px',
          borderBottom: `1px solid ${C.border}`,
          background: `linear-gradient(135deg, ${C.gold}15, ${C.petrol}08)`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: `linear-gradient(135deg, ${C.gold}, #a07010)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <BookMarked size={18} color="white" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.dark }}>
                Salvar como meu modelo
              </h3>
              <p style={{ margin: 0, fontSize: 11, color: C.muted }}>
                Tipo: <strong>{DOC_TYPE_LABEL[docType]}</strong>
              </p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted }}>
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px' }}>
          {/* Aviso de separação template × documento */}
          <div style={{
            padding: '10px 14px', borderRadius: 10,
            background: '#f0fdf4', border: '1px solid #bbf7d0',
            fontSize: 12, color: '#166534', marginBottom: 18, lineHeight: 1.5,
          }}>
            <strong>O que será salvo:</strong> apenas a estrutura (seções, campos, placeholders).
            Os dados do aluno não fazem parte do modelo.
          </div>

          {/* Nome */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: C.dark, marginBottom: 6 }}>
              Nome do modelo <span style={{ color: '#dc2626' }}>*</span>
            </label>
            <input
              value={name}
              onChange={e => { setName(e.target.value); setError(null); }}
              placeholder={`Ex: ${DOC_TYPE_LABEL[docType]} Sala de Recursos 2024`}
              maxLength={80}
              style={{
                width: '100%', padding: '9px 12px', borderRadius: 8, boxSizing: 'border-box',
                border: `1.5px solid ${error && !name.trim() ? '#fca5a5' : C.border}`,
                fontSize: 13, outline: 'none', background: C.bg,
              }}
              autoFocus
            />
          </div>

          {/* Descrição */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: C.dark, marginBottom: 6 }}>
              Descrição <span style={{ fontSize: 11, fontWeight: 400, color: C.muted }}>(opcional)</span>
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Ex: Modelo adaptado para alunos com TEA nível 1"
              rows={2}
              maxLength={200}
              style={{
                width: '100%', padding: '9px 12px', borderRadius: 8, boxSizing: 'border-box',
                border: `1.5px solid ${C.border}`, fontSize: 13, outline: 'none',
                background: C.bg, resize: 'none', fontFamily: 'inherit',
              }}
            />
          </div>

          {/* Marcar como padrão */}
          <label style={{
            display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer',
            padding: '12px 14px', borderRadius: 10,
            border: `1.5px solid ${isDefault ? C.gold : C.border}`,
            background: isDefault ? '#fffbeb' : C.bg,
            marginBottom: 4,
          }}>
            <input
              type="checkbox"
              checked={isDefault}
              onChange={e => setIsDefault(e.target.checked)}
              style={{ marginTop: 2, accentColor: C.gold, cursor: 'pointer', flexShrink: 0 }}
            />
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Star size={13} color={isDefault ? C.gold : C.muted} fill={isDefault ? C.gold : 'none'} />
                <span style={{ fontSize: 13, fontWeight: 600, color: C.dark }}>
                  Definir como meu modelo padrão
                </span>
              </div>
              <p style={{ margin: '3px 0 0', fontSize: 11, color: C.muted, lineHeight: 1.4 }}>
                Ao criar um novo {DOC_TYPE_LABEL[docType]}, este modelo será sugerido automaticamente.
                Substitui o padrão anterior, se houver.
              </p>
            </div>
          </label>

          {error && (
            <p style={{ margin: '10px 0 0', fontSize: 12, color: '#dc2626', fontWeight: 600 }}>
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 24px 20px',
          display: 'flex', gap: 8, justifyContent: 'flex-end',
        }}>
          <button
            onClick={onClose}
            disabled={saving}
            style={{
              padding: '9px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600,
              border: `1.5px solid ${C.border}`, background: 'white', color: C.muted,
              cursor: saving ? 'not-allowed' : 'pointer',
            }}
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            style={{
              padding: '9px 24px', borderRadius: 8, fontSize: 13, fontWeight: 700,
              background: saving || !name.trim()
                ? '#d1d5db'
                : `linear-gradient(135deg, ${C.gold}, #a07010)`,
              color: 'white', border: 'none',
              cursor: saving || !name.trim() ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            {saving ? <><Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> Salvando...</> : 'Salvar modelo'}
          </button>
        </div>
      </div>
    </div>
  );
};
