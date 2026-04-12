/**
 * StoredTemplateSelector.tsx
 * Modal para selecionar um modelo salvo da biblioteca "Meus Modelos"
 * Usado nos geradores de documentos (PEI, PAEE, PDI, Estudo de Caso)
 */

import React, { useState, useEffect } from 'react';
import { X, FileText, Clock, CheckCircle, AlertCircle, Loader, Search, Star } from 'lucide-react';
import { listTemplates, SchoolTemplate, TemplateDocType, DOC_TYPE_LABELS } from '../services/templateService';

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

interface StoredTemplateSelectorProps {
  /** Tipo do documento no DocumentBuilder (ex: "PEI", "Estudo de Caso") */
  docType: string;
  onSelect: (template: SchoolTemplate) => void;
  onClose: () => void;
}

export const StoredTemplateSelector: React.FC<StoredTemplateSelectorProps> = ({
  docType,
  onSelect,
  onClose,
}) => {
  const [templates, setTemplates] = useState<SchoolTemplate[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [search, setSearch]       = useState('');
  const [showAll, setShowAll]     = useState(false);

  const templateDocType = DOC_TYPE_MAP[docType] as TemplateDocType | undefined;

  useEffect(() => {
    setLoading(true);
    setError(null);
    // Busca filtrado pelo tipo do documento atual (mais relevante)
    // e também busca todos para permitir "ver todos"
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
                <Star size={18} color="white" />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: C.dark }}>
                  Biblioteca de Modelos
                </h3>
                <p style={{ margin: 0, fontSize: 12, color: C.muted }}>
                  Modelos salvos em "Meus Modelos"
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

          {/* Contexto */}
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

// ─── Card de cada modelo ──────────────────────────────────────────────────────

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
