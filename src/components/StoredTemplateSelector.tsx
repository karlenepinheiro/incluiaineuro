/**
 * StoredTemplateSelector.tsx
 * Modal para selecionar um modelo salvo da biblioteca "Meus Modelos"
 * Usado nos geradores de documentos (PEI, PAEE, PDI, Estudo de Caso)
 */

import React, { useState, useEffect } from 'react';
import { X, FileText, Clock, CheckCircle, AlertCircle, Loader, Search, Star, BookMarked, Crown } from 'lucide-react';
import { listTemplates, SchoolTemplate, TemplateDocType, DOC_TYPE_LABELS } from '../services/templateService';
import { UserTemplateService } from '../services/userTemplateService';
import { UserDocumentTemplate, UserDocTemplateType } from '../types';

// ─── Paleta IncluiAI ──────────────────────────────────────────────────────────
const C = {
  petrol:  '#1F4E5F',
  dark:    '#2E3A59',
  gold:    '#C69214',
  bg:      '#F6F4EF',
  surface: '#FFFFFF',
  border:  '#E7E2D8',
  muted:   '#6B7280',
};

// Mapa de documentType do documento atual para TemplateDocType
const DOC_TYPE_MAP: Record<string, TemplateDocType> = {
  'PEI':            'PEI',
  'PAEE':           'PAEE',
  'PDI':            'PDI',
  'Estudo de Caso': 'estudo_de_caso',
};

// Mapa de DocumentType (enum value) para UserDocTemplateType
const DOC_TYPE_TO_USER_TEMPLATE: Record<string, UserDocTemplateType | null> = {
  'PEI':            'PEI',
  'Estudo de Caso': 'ESTUDO_CASO',
  'PAEE':           null,  // Fase 2 — não suportado ainda
  'PDI':            null,
};

interface StoredTemplateSelectorProps {
  /** Tipo do documento no DocumentBuilder (ex: "PEI", "Estudo de Caso") */
  docType: string;
  onSelect: (template: SchoolTemplate) => void;
  /** Callback para user templates (JSON estruturado). Se não fornecido, seção fica oculta. */
  onSelectUserTemplate?: (template: UserDocumentTemplate) => void;
  onClose: () => void;
}

export const StoredTemplateSelector: React.FC<StoredTemplateSelectorProps> = ({
  docType,
  onSelect,
  onSelectUserTemplate,
  onClose,
}) => {
  const [templates, setTemplates]             = useState<SchoolTemplate[]>([]);
  const [userTemplates, setUserTemplates]     = useState<UserDocumentTemplate[]>([]);
  const [loading, setLoading]                 = useState(true);
  const [loadingUser, setLoadingUser]         = useState(false);
  const [error, setError]                     = useState<string | null>(null);
  const [search, setSearch]                   = useState('');
  const [showAll, setShowAll]                 = useState(false);

  const templateDocType   = DOC_TYPE_MAP[docType] as TemplateDocType | undefined;
  const userDocType       = DOC_TYPE_TO_USER_TEMPLATE[docType] ?? null;
  const showUserSection   = !!onSelectUserTemplate && !!userDocType;

  // Carrega user templates (Meus Modelos) quando o tipo é suportado
  useEffect(() => {
    if (!showUserSection || !userDocType) return;
    setLoadingUser(true);
    UserTemplateService.list(userDocType)
      .then(list => setUserTemplates(list))
      .catch(() => setUserTemplates([]))
      .finally(() => setLoadingUser(false));
  }, [userDocType, showUserSection]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    listTemplates(showAll ? undefined : templateDocType)
      .then(list => {
        setTemplates(list.filter(t => t.status === 'ready'));
        setLoading(false);
      })
      .catch(e => {
        setError('Erro ao carregar modelos: ' + e.message);
        setLoading(false);
      });
  }, [templateDocType, showAll]);

  const filtered = templates.filter(t =>
    !search || t.name.toLowerCase().includes(search.toLowerCase()) ||
    (t.description ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const docTypeLabel = templateDocType ? DOC_TYPE_LABELS[templateDocType] : docType;

  return (
    // Overlay
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(30,46,80,0.55)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px',
      }}
      onClick={onClose}
    >
      {/* Modal */}
      <div
        style={{
          background: C.surface, borderRadius: 20, width: '100%', maxWidth: 640,
          maxHeight: '90vh', display: 'flex', flexDirection: 'column',
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)', overflow: 'hidden',
        }}
        onClick={e => e.stopPropagation()}
      >

        {/* ── Header ── */}
        <div style={{
          padding: '20px 24px 16px',
          borderBottom: `1px solid ${C.border}`,
          background: `linear-gradient(135deg, ${C.petrol}12, ${C.dark}08)`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: `linear-gradient(135deg, ${C.petrol}, ${C.dark})`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <BookMarked size={18} color="white" />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: C.dark }}>
                  Escolher Modelo
                </h3>
                <p style={{ margin: 0, fontSize: 12, color: C.muted }}>
                  Meus modelos personalizados ou modelos da escola (.docx)
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 6, color: C.muted }}
            >
              <X size={20} />
            </button>
          </div>

          {/* Benefit badge */}
          <div style={{
            marginTop: 12, display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 12px', background: '#f0fdf4', border: '1px solid #bbf7d0',
            borderRadius: 8, fontSize: 12, color: '#15803d', fontWeight: 600,
          }}>
            <CheckCircle size={13} />
            <span>Sem consumo adicional de créditos — modelo já processado na sua biblioteca Premium</span>
          </div>
        </div>

        {/* ── Filtros e busca ── */}
        <div style={{ padding: '12px 24px', borderBottom: `1px solid ${C.border}`, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: C.muted }} />
            <input
              placeholder="Buscar modelo..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: '100%', padding: '7px 10px 7px 30px', borderRadius: 8,
                border: `1.5px solid ${C.border}`, fontSize: 13, outline: 'none',
                boxSizing: 'border-box', background: C.bg,
              }}
            />
          </div>
          <button
            onClick={() => setShowAll(v => !v)}
            style={{
              padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
              border: `1.5px solid ${showAll ? C.petrol : C.border}`,
              background: showAll ? `${C.petrol}12` : 'white',
              color: showAll ? C.petrol : C.muted,
              cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            {showAll ? `Mostrar só ${docType}` : 'Ver todos os tipos'}
          </button>
        </div>

        {/* ── Lista ── */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '12px 24px 16px' }}>

          {/* ── SEÇÃO: MEUS MODELOS (user templates JSON) ── */}
          {showUserSection && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <Crown size={14} color={C.gold} />
                <span style={{ fontSize: 12, fontWeight: 700, color: C.dark, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Meus Modelos
                </span>
                <span style={{ fontSize: 11, color: C.muted }}>({userTemplates.length})</span>
              </div>

              {loadingUser && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 0', color: C.muted }}>
                  <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} />
                  <span style={{ fontSize: 12 }}>Carregando meus modelos...</span>
                </div>
              )}

              {!loadingUser && userTemplates.length === 0 && (
                <div style={{
                  padding: '12px 16px', borderRadius: 10,
                  background: '#F6F4EF', border: `1.5px dashed ${C.border}`,
                  textAlign: 'center', color: C.muted,
                }}>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>Nenhum modelo personalizado salvo ainda.</p>
                  <p style={{ margin: '4px 0 0', fontSize: 11 }}>
                    Crie um documento, edite a estrutura e clique em "Salvar como meu modelo".
                  </p>
                </div>
              )}

              {!loadingUser && userTemplates.map(t => (
                <UserTemplateCard
                  key={t.id}
                  template={t}
                  onSelect={() => onSelectUserTemplate!(t)}
                />
              ))}

              {/* Divisor visual entre user templates e school templates */}
              {templates.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '16px 0 4px' }}>
                  <div style={{ flex: 1, height: 1, background: C.border }} />
                  <span style={{ fontSize: 11, color: C.muted, fontWeight: 600, whiteSpace: 'nowrap' }}>
                    Modelos da escola (.docx)
                  </span>
                  <div style={{ flex: 1, height: 1, background: C.border }} />
                </div>
              )}
            </div>
          )}

          {/* Contexto modelos escola */}
          {!showAll && templateDocType && (
            <p style={{ margin: '0 0 12px', fontSize: 12, color: C.muted }}>
              Exibindo modelos compatíveis com <strong>{docTypeLabel}</strong>.
              {' '}<button onClick={() => setShowAll(true)} style={{ background: 'none', border: 'none', color: C.petrol, cursor: 'pointer', fontSize: 12, fontWeight: 600, padding: 0 }}>Ver todos →</button>
            </p>
          )}

          {/* Loading */}
          {loading && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px 0', gap: 10, color: C.muted }}>
              <Loader size={24} style={{ animation: 'spin 1s linear infinite' }} />
              <span style={{ fontSize: 13 }}>Carregando modelos...</span>
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={{ display: 'flex', gap: 8, padding: 14, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, alignItems: 'flex-start' }}>
              <AlertCircle size={16} color="#dc2626" style={{ marginTop: 1, flexShrink: 0 }} />
              <p style={{ margin: 0, fontSize: 13, color: '#dc2626' }}>{error}</p>
            </div>
          )}

          {/* Empty */}
          {!loading && !error && filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: '32px 16px', color: C.muted }}>
              <FileText size={40} style={{ marginBottom: 10, opacity: 0.3 }} />
              <p style={{ margin: 0, fontWeight: 600, fontSize: 14 }}>
                {search ? 'Nenhum modelo encontrado para esta busca.' : `Nenhum modelo ${showAll ? '' : `de ${docType} `}salvo ainda.`}
              </p>
              <p style={{ margin: '6px 0 0', fontSize: 12 }}>
                Vá até "Meus Modelos" para adicionar documentos à biblioteca.
              </p>
            </div>
          )}

          {/* Template cards */}
          {!loading && !error && filtered.map(template => (
            <TemplateCard
              key={template.id}
              template={template}
              currentDocType={docType}
              onSelect={() => onSelect(template)}
            />
          ))}
        </div>

        {/* ── Footer ── */}
        <div style={{ padding: '12px 24px', borderTop: `1px solid ${C.border}`, display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              padding: '9px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600,
              border: `1.5px solid ${C.border}`, background: 'white', color: C.muted,
              cursor: 'pointer',
            }}
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Card de User Template (modelo personalizado JSON) ───────────────────────

interface UserTemplateCardProps {
  template: UserDocumentTemplate;
  onSelect: () => void;
}

const UserTemplateCard: React.FC<UserTemplateCardProps> = ({ template, onSelect }) => {
  const typeLabel = template.documentType === 'ESTUDO_CASO' ? 'Estudo de Caso' : 'PEI';
  const typeColors = template.documentType === 'ESTUDO_CASO'
    ? { bg: '#fff7ed', text: '#c2410c', border: '#fed7aa' }
    : { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe' };

  return (
    <div style={{
      border: `1.5px solid ${template.isDefault ? C.gold : C.border}`,
      borderRadius: 12, padding: '12px 14px', marginBottom: 8,
      background: template.isDefault ? '#fffbeb' : C.surface,
      display: 'flex', alignItems: 'flex-start', gap: 10,
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 10, flexShrink: 0,
        background: typeColors.bg, border: `1px solid ${typeColors.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <FileText size={17} color={typeColors.text} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, fontSize: 13, color: C.dark }}>{template.name}</span>
          {template.isDefault && (
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99,
              background: C.gold, color: 'white',
            }}>PADRÃO</span>
          )}
          {template.source === 'system' && (
            <span style={{
              fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 99,
              background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0',
            }}>baseado no IncluiAI</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
          <span style={{
            fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99,
            background: typeColors.bg, color: typeColors.text, border: `1px solid ${typeColors.border}`,
          }}>{typeLabel}</span>
          {template.timesUsed > 0 && (
            <span style={{ fontSize: 11, color: C.muted, display: 'flex', alignItems: 'center', gap: 3 }}>
              <Clock size={11} /> Usado {template.timesUsed}×
            </span>
          )}
          <span style={{ fontSize: 11, color: C.muted }}>
            {template.templateData.sections.length} seções
          </span>
        </div>
        {template.description && (
          <p style={{ margin: '4px 0 0', fontSize: 12, color: C.muted, lineHeight: 1.4 }}>
            {template.description}
          </p>
        )}
      </div>

      <button
        onClick={onSelect}
        style={{
          flexShrink: 0, padding: '7px 14px', borderRadius: 8,
          background: `linear-gradient(135deg, ${C.gold}, #a07010)`,
          color: 'white', border: 'none', fontSize: 12, fontWeight: 700,
          cursor: 'pointer', whiteSpace: 'nowrap',
        }}
      >
        Usar este
      </button>
    </div>
  );
};

// ─── Card de cada modelo .docx ────────────────────────────────────────────────

const TYPE_COLORS: Record<TemplateDocType, { bg: string; text: string; border: string }> = {
  PEI:           { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe' },
  PAEE:          { bg: '#f0fdf4', text: '#15803d', border: '#bbf7d0' },
  PDI:           { bg: '#fdf4ff', text: '#7e22ce', border: '#e9d5ff' },
  estudo_de_caso:{ bg: '#fff7ed', text: '#c2410c', border: '#fed7aa' },
  outro:         { bg: '#f9fafb', text: '#374151', border: '#e5e7eb' },
};

interface TemplateCardProps {
  template: SchoolTemplate;
  currentDocType: string;
  onSelect: () => void;
}

const TemplateCard: React.FC<TemplateCardProps> = ({ template, currentDocType, onSelect }) => {
  const typeKey = (template.documentType ?? 'outro') as TemplateDocType;
  const typeColors = TYPE_COLORS[typeKey] ?? TYPE_COLORS.outro;
  const typeLabel = template.documentType ? DOC_TYPE_LABELS[typeKey] : 'Tipo não definido';

  // Destaca se é o tipo exato do documento atual
  const DOC_TYPE_MAP_LOCAL: Record<string, TemplateDocType> = {
    'PEI': 'PEI', 'PAEE': 'PAEE', 'PDI': 'PDI', 'Estudo de Caso': 'estudo_de_caso',
  };
  const isExactMatch = template.documentType === DOC_TYPE_MAP_LOCAL[currentDocType];
  const foundTagsCount = template.tagsInjected.filter(t => t.found).length;

  return (
    <div style={{
      border: `1.5px solid ${isExactMatch ? C.petrol : C.border}`,
      borderRadius: 12,
      padding: '14px 16px',
      marginBottom: 10,
      background: isExactMatch ? `${C.petrol}06` : C.surface,
      display: 'flex', alignItems: 'flex-start', gap: 12,
      transition: 'all 0.15s',
    }}>
      {/* Icon */}
      <div style={{
        width: 38, height: 38, borderRadius: 10, flexShrink: 0,
        background: typeColors.bg, border: `1px solid ${typeColors.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <FileText size={18} color={typeColors.text} />
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: C.dark }}>{template.name}</span>
          {isExactMatch && (
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 7px',
              borderRadius: 99, background: C.petrol, color: 'white',
            }}>
              Recomendado
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
          <span style={{
            fontSize: 11, fontWeight: 600, padding: '2px 8px',
            borderRadius: 99, background: typeColors.bg,
            color: typeColors.text, border: `1px solid ${typeColors.border}`,
          }}>
            {typeLabel}
          </span>
          {foundTagsCount > 0 && (
            <span style={{ fontSize: 11, color: C.muted }}>
              {foundTagsCount} {foundTagsCount === 1 ? 'campo' : 'campos'} mapeado{foundTagsCount !== 1 ? 's' : ''}
            </span>
          )}
          {template.timesUsed > 0 && (
            <span style={{ fontSize: 11, color: C.muted, display: 'flex', alignItems: 'center', gap: 3 }}>
              <Clock size={11} /> Usado {template.timesUsed}×
            </span>
          )}
        </div>

        {template.description && (
          <p style={{ margin: '5px 0 0', fontSize: 12, color: C.muted, lineHeight: 1.4 }}>
            {template.description}
          </p>
        )}
      </div>

      {/* Button */}
      <button
        onClick={onSelect}
        style={{
          flexShrink: 0,
          padding: '8px 16px', borderRadius: 8,
          background: `linear-gradient(135deg, ${C.petrol}, ${C.dark})`,
          color: 'white', border: 'none', fontSize: 13, fontWeight: 700,
          cursor: 'pointer', whiteSpace: 'nowrap',
        }}
      >
        Usar este
      </button>
    </div>
  );
};
