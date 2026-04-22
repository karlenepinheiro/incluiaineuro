/**
 * DocumentTemplateEditor.tsx
 * Editor MVP de estrutura de template — Fase 3.
 *
 * Escopo: editar título, seções, ordem, campos básicos, placeholders e texto-base.
 * Sem drag-and-drop. Reordenação via botões ▲▼.
 *
 * SEPARAÇÃO EXPLÍCITA (Ajuste 2):
 *   Este editor trabalha com uma CÓPIA da estrutura do documento.
 *   Os valores (dados do aluno) são descartados na inicialização.
 *   Ao salvar, apenas a estrutura vai para user_document_templates.
 */

import React, { useState, useCallback } from 'react';
import {
  X, Plus, Trash2, ChevronDown, ChevronUp,
  ArrowUp, ArrowDown, Save, BookMarked, Info,
} from 'lucide-react';
import { DocSection, DocField, UserDocumentTemplate, UserDocTemplateType, TemplateSectionDef, TemplateFieldDef, TemplateData } from '../types';
import { UserTemplateService } from '../services/userTemplateService';
import { SaveTemplateModal } from './SaveTemplateModal';

// ---------------------------------------------------------------------------
// Paleta
// ---------------------------------------------------------------------------
const C = {
  petrol:  '#1F4E5F',
  dark:    '#2E3A59',
  gold:    '#C69214',
  bg:      '#F6F4EF',
  surface: '#FFFFFF',
  border:  '#E7E2D8',
  muted:   '#6B7280',
  danger:  '#dc2626',
};

// ---------------------------------------------------------------------------
// Tipos internos do editor (sem value — apenas estrutura)
// ---------------------------------------------------------------------------
type FieldType = DocField['type'];

interface EditorField {
  id: string;
  label: string;
  type: FieldType;
  placeholder: string;
  description: string;
  options: string[];
  allowAudio: 'none' | 'optional' | 'only';
}

interface EditorSection {
  id: string;
  title: string;
  fields: EditorField[];
  collapsed: boolean;
  isLocked: boolean;  // seção de identificação não pode ser deletada
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
let _idCounter = Date.now();
const genId = (prefix: string) => `${prefix}_${++_idCounter}`;

const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text:      'Texto curto',
  textarea:  'Texto longo',
  select:    'Lista (select)',
  date:      'Data',
  checklist: 'Checklist',
  scale:     'Escala',
  grid:      'Tabela (grid)',
};

const MVP_FIELD_TYPES: FieldType[] = ['textarea', 'text', 'checklist', 'select', 'date', 'scale'];

function docSectionsToEditorSections(sections: DocSection[]): EditorSection[] {
  return sections.map(s => ({
    id:        s.id,
    title:     s.title,
    collapsed: false,
    isLocked:  s.id === 'header',
    fields:    s.fields.map(f => ({
      id:          f.id,
      label:       f.label,
      type:        f.type,
      // Descarta o value — só estrutura vai para o template
      placeholder: f.placeholder || '',
      description: f.description || '',
      options:     f.options ? [...f.options] : [],
      allowAudio:  f.allowAudio || 'optional',
    })),
  }));
}

function editorSectionsToTemplateData(
  sections: EditorSection[],
  docType: UserDocTemplateType,
): TemplateData {
  return {
    metadata: {
      schemaVersion: '1.0',
      docType,
      lang:          'pt-BR',
      createdFrom:   'system',
    },
    sections: sections.map((s, sIdx): TemplateSectionDef => ({
      id:          s.id,
      title:       s.title,
      order:       sIdx,
      isLocked:    s.isLocked,
      fields:      s.fields.map((f, fIdx): TemplateFieldDef => ({
        id:           f.id,
        label:        f.label,
        type:         f.type,
        placeholder:  f.placeholder || undefined,
        description:  f.description || undefined,
        options:      f.options.length > 0 ? f.options : undefined,
        allowAudio:   f.allowAudio,
        defaultValue: '',
        order:        fIdx,
        isLocked:     false,
      })),
    })),
  };
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface DocumentTemplateEditorProps {
  /** Tipo do documento (PEI ou Estudo de Caso) */
  docType: UserDocTemplateType;
  /** Seções atuais do documento — apenas a estrutura será copiada, sem valores */
  initialSections: DocSection[];
  /** Chamado após salvar com sucesso */
  onSaved?: (template: UserDocumentTemplate) => void;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------
export const DocumentTemplateEditor: React.FC<DocumentTemplateEditorProps> = ({
  docType,
  initialSections,
  onSaved,
  onClose,
}) => {
  const [sections, setSections]       = useState<EditorSection[]>(() => docSectionsToEditorSections(initialSections));
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // ── Seções ─────────────────────────────────────────────────────────────────

  const toggleCollapse = (idx: number) => setSections(prev =>
    prev.map((s, i) => i === idx ? { ...s, collapsed: !s.collapsed } : s),
  );

  const moveSection = (idx: number, dir: -1 | 1) => setSections(prev => {
    const next = [...prev];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return prev;
    [next[idx], next[target]] = [next[target], next[idx]];
    return next;
  });

  const updateSectionTitle = (idx: number, title: string) => setSections(prev =>
    prev.map((s, i) => i === idx ? { ...s, title } : s),
  );

  const removeSection = (idx: number) => setSections(prev => prev.filter((_, i) => i !== idx));

  const addSection = () => setSections(prev => [
    ...prev,
    {
      id:        genId('sec'),
      title:     'Nova Seção',
      fields:    [{ id: genId('f'), label: 'Campo 1', type: 'textarea', placeholder: '', description: '', options: [], allowAudio: 'optional' }],
      collapsed: false,
      isLocked:  false,
    },
  ]);

  // ── Campos ─────────────────────────────────────────────────────────────────

  const moveField = (secIdx: number, fIdx: number, dir: -1 | 1) => setSections(prev => {
    const next = prev.map(s => ({ ...s, fields: [...s.fields] }));
    const fields = next[secIdx].fields;
    const target = fIdx + dir;
    if (target < 0 || target >= fields.length) return prev;
    [fields[fIdx], fields[target]] = [fields[target], fields[fIdx]];
    return next;
  });

  const updateField = (secIdx: number, fIdx: number, patch: Partial<EditorField>) => setSections(prev =>
    prev.map((s, si) => si !== secIdx ? s : {
      ...s,
      fields: s.fields.map((f, fi) => fi !== fIdx ? f : { ...f, ...patch }),
    }),
  );

  const removeField = (secIdx: number, fIdx: number) => setSections(prev =>
    prev.map((s, si) => si !== secIdx ? s : {
      ...s,
      fields: s.fields.filter((_, fi) => fi !== fIdx),
    }),
  );

  const addField = (secIdx: number) => setSections(prev =>
    prev.map((s, si) => si !== secIdx ? s : {
      ...s,
      fields: [
        ...s.fields,
        { id: genId('f'), label: 'Novo campo', type: 'textarea', placeholder: '', description: '', options: [], allowAudio: 'optional' },
      ],
    }),
  );

  // ── Salvar ─────────────────────────────────────────────────────────────────

  const handleSave = useCallback(async (name: string, description: string, isDefault: boolean) => {
    const templateData = editorSectionsToTemplateData(sections, docType);
    const saved = await UserTemplateService.save({
      name,
      description: description || undefined,
      documentType: docType,
      source:       'user',
      templateData,
      isDefault,
    });
    setShowSaveModal(false);
    setSaveSuccess(true);
    onSaved?.(saved);
    // Fecha o editor após breve feedback
    setTimeout(onClose, 1400);
  }, [sections, docType, onSaved, onClose]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 10500,
        background: 'rgba(30,46,80,0.65)', backdropFilter: 'blur(4px)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'flex-start',
        padding: '20px 16px',
        overflowY: 'auto',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: C.surface, borderRadius: 20, width: '100%', maxWidth: 720,
          boxShadow: '0 24px 80px rgba(0,0,0,0.3)',
          display: 'flex', flexDirection: 'column',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div style={{
          padding: '18px 24px 14px',
          borderBottom: `1px solid ${C.border}`,
          background: `linear-gradient(135deg, ${C.petrol}12, ${C.dark}06)`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 34, height: 34, borderRadius: 9,
                background: `linear-gradient(135deg, ${C.petrol}, ${C.dark})`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <BookMarked size={16} color="white" />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.dark }}>
                  Editar estrutura do modelo
                </h3>
                <p style={{ margin: 0, fontSize: 11, color: C.muted }}>
                  {docType === 'PEI' ? 'PEI' : 'Estudo de Caso'} — ajuste seções, campos e placeholders
                </p>
              </div>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, padding: 4 }}>
              <X size={20} />
            </button>
          </div>

          {/* Aviso de separação */}
          <div style={{
            marginTop: 10, display: 'flex', alignItems: 'flex-start', gap: 7,
            padding: '8px 12px', borderRadius: 8,
            background: '#eff6ff', border: '1px solid #bfdbfe',
            fontSize: 11, color: '#1e40af', lineHeight: 1.4,
          }}>
            <Info size={13} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>
              Você está editando a <strong>estrutura do modelo</strong>.
              Dados do aluno não serão incluídos. Use placeholders para indicar o que deve ser preenchido.
            </span>
          </div>
        </div>

        {/* ── Feedback de sucesso ── */}
        {saveSuccess && (
          <div style={{
            padding: '10px 24px', background: '#f0fdf4',
            borderBottom: '1px solid #bbf7d0',
            fontSize: 13, fontWeight: 600, color: '#15803d',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            ✓ Modelo salvo com sucesso! Fechando...
          </div>
        )}

        {/* ── Body: lista de seções ── */}
        <div style={{ padding: '16px 24px', flex: 1 }}>

          {sections.map((sec, sIdx) => (
            <SectionCard
              key={sec.id}
              section={sec}
              sIdx={sIdx}
              total={sections.length}
              onToggleCollapse={() => toggleCollapse(sIdx)}
              onTitleChange={t => updateSectionTitle(sIdx, t)}
              onMoveUp={sIdx > 0 ? () => moveSection(sIdx, -1) : undefined}
              onMoveDown={sIdx < sections.length - 1 ? () => moveSection(sIdx, 1) : undefined}
              onRemove={!sec.isLocked && sections.length > 1 ? () => removeSection(sIdx) : undefined}
              onAddField={() => addField(sIdx)}
              onMoveField={(fIdx, dir) => moveField(sIdx, fIdx, dir)}
              onUpdateField={(fIdx, patch) => updateField(sIdx, fIdx, patch)}
              onRemoveField={(fIdx) => removeField(sIdx, fIdx)}
            />
          ))}

          {/* Add seção */}
          <button
            onClick={addSection}
            style={{
              width: '100%', padding: '10px', borderRadius: 10, marginTop: 4,
              border: `2px dashed ${C.border}`, background: 'transparent',
              fontSize: 13, fontWeight: 600, color: C.muted,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = C.petrol; (e.currentTarget as HTMLButtonElement).style.color = C.petrol; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = C.border; (e.currentTarget as HTMLButtonElement).style.color = C.muted; }}
          >
            <Plus size={15} /> Adicionar seção
          </button>
        </div>

        {/* ── Footer ── */}
        <div style={{
          padding: '14px 24px 20px',
          borderTop: `1px solid ${C.border}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
        }}>
          <p style={{ margin: 0, fontSize: 11, color: C.muted }}>
            {sections.length} seção{sections.length !== 1 ? 'ões' : ''} ·{' '}
            {sections.reduce((acc, s) => acc + s.fields.length, 0)} campo{sections.reduce((acc, s) => acc + s.fields.length, 0) !== 1 ? 's' : ''}
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={onClose}
              style={{
                padding: '9px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                border: `1.5px solid ${C.border}`, background: 'white', color: C.muted,
                cursor: 'pointer',
              }}
            >
              Cancelar
            </button>
            <button
              onClick={() => setShowSaveModal(true)}
              style={{
                padding: '9px 20px', borderRadius: 8, fontSize: 13, fontWeight: 700,
                background: `linear-gradient(135deg, ${C.gold}, #a07010)`,
                color: 'white', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              <Save size={14} /> Salvar como meu modelo
            </button>
          </div>
        </div>
      </div>

      {/* Modal de salvar */}
      {showSaveModal && (
        <SaveTemplateModal
          docType={docType}
          onSave={handleSave}
          onClose={() => setShowSaveModal(false)}
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// SectionCard
// ---------------------------------------------------------------------------
interface SectionCardProps {
  section:          EditorSection;
  sIdx:             number;
  total:            number;
  onToggleCollapse: () => void;
  onTitleChange:    (t: string) => void;
  onMoveUp?:        () => void;
  onMoveDown?:      () => void;
  onRemove?:        () => void;
  onAddField:       () => void;
  onMoveField:      (fIdx: number, dir: -1 | 1) => void;
  onUpdateField:    (fIdx: number, patch: Partial<EditorField>) => void;
  onRemoveField:    (fIdx: number) => void;
}

const SectionCard: React.FC<SectionCardProps> = ({
  section, sIdx, onToggleCollapse, onTitleChange,
  onMoveUp, onMoveDown, onRemove, onAddField,
  onMoveField, onUpdateField, onRemoveField,
}) => (
  <div style={{
    border: `1.5px solid ${C.border}`, borderRadius: 12,
    marginBottom: 10, overflow: 'hidden',
  }}>
    {/* Cabeçalho da seção */}
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '10px 12px',
      background: `${C.petrol}08`,
      borderBottom: section.collapsed ? 'none' : `1px solid ${C.border}`,
    }}>
      <button
        onClick={onToggleCollapse}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, padding: 2, flexShrink: 0 }}
      >
        {section.collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
      </button>

      <input
        value={section.title}
        onChange={e => onTitleChange(e.target.value)}
        placeholder="Título da seção"
        style={{
          flex: 1, padding: '5px 8px', borderRadius: 6, fontSize: 13, fontWeight: 700,
          border: `1.5px solid transparent`, background: 'transparent', outline: 'none',
          color: C.dark,
        }}
        onFocus={e => (e.currentTarget.style.borderColor = C.petrol)}
        onBlur={e => (e.currentTarget.style.borderColor = 'transparent')}
      />

      <span style={{ fontSize: 11, color: C.muted, flexShrink: 0 }}>
        {section.fields.length} campo{section.fields.length !== 1 ? 's' : ''}
      </span>

      {/* Reordenação ▲▼ */}
      <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
        <button
          onClick={onMoveUp}
          disabled={!onMoveUp}
          title="Mover seção para cima"
          style={{
            background: 'none', border: 'none', padding: 3, borderRadius: 4,
            cursor: onMoveUp ? 'pointer' : 'not-allowed',
            color: onMoveUp ? C.petrol : '#d1d5db',
          }}
        >
          <ArrowUp size={14} />
        </button>
        <button
          onClick={onMoveDown}
          disabled={!onMoveDown}
          title="Mover seção para baixo"
          style={{
            background: 'none', border: 'none', padding: 3, borderRadius: 4,
            cursor: onMoveDown ? 'pointer' : 'not-allowed',
            color: onMoveDown ? C.petrol : '#d1d5db',
          }}
        >
          <ArrowDown size={14} />
        </button>
      </div>

      {/* Deletar seção */}
      {onRemove ? (
        <button
          onClick={onRemove}
          title="Remover seção"
          style={{ background: 'none', border: 'none', padding: 3, cursor: 'pointer', color: '#fca5a5', borderRadius: 4, flexShrink: 0 }}
          onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.color = C.danger)}
          onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.color = '#fca5a5')}
        >
          <Trash2 size={14} />
        </button>
      ) : (
        <div style={{ width: 20, flexShrink: 0 }} title={section.isLocked ? 'Seção obrigatória' : undefined}>
          {section.isLocked && <span style={{ fontSize: 10, color: C.muted }}>🔒</span>}
        </div>
      )}
    </div>

    {/* Campos (quando não colapsado) */}
    {!section.collapsed && (
      <div style={{ padding: '10px 12px' }}>
        {section.fields.map((field, fIdx) => (
          <FieldRow
            key={field.id}
            field={field}
            fIdx={fIdx}
            total={section.fields.length}
            onMoveUp={fIdx > 0 ? () => onMoveField(fIdx, -1) : undefined}
            onMoveDown={fIdx < section.fields.length - 1 ? () => onMoveField(fIdx, 1) : undefined}
            onUpdate={patch => onUpdateField(fIdx, patch)}
            onRemove={section.fields.length > 1 ? () => onRemoveField(fIdx) : undefined}
          />
        ))}

        <button
          onClick={onAddField}
          style={{
            marginTop: 6, padding: '7px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
            border: `1.5px dashed ${C.border}`, background: 'transparent',
            color: C.muted, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = C.petrol; (e.currentTarget as HTMLButtonElement).style.color = C.petrol; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = C.border; (e.currentTarget as HTMLButtonElement).style.color = C.muted; }}
        >
          <Plus size={13} /> Adicionar campo
        </button>
      </div>
    )}
  </div>
);

// ---------------------------------------------------------------------------
// FieldRow — linha de edição de um campo
// ---------------------------------------------------------------------------
interface FieldRowProps {
  field:      EditorField;
  fIdx:       number;
  total:      number;
  onMoveUp?:  () => void;
  onMoveDown?: () => void;
  onUpdate:   (patch: Partial<EditorField>) => void;
  onRemove?:  () => void;
}

const FieldRow: React.FC<FieldRowProps> = ({
  field, onMoveUp, onMoveDown, onUpdate, onRemove,
}) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={{
      border: `1px solid ${C.border}`, borderRadius: 8, marginBottom: 6,
      background: C.bg, overflow: 'hidden',
    }}>
      {/* Linha principal */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px' }}>
        {/* Label */}
        <input
          value={field.label}
          onChange={e => onUpdate({ label: e.target.value })}
          placeholder="Nome do campo"
          style={{
            flex: 1, padding: '4px 7px', borderRadius: 6, fontSize: 12, fontWeight: 600,
            border: `1.5px solid transparent`, background: 'transparent', outline: 'none', color: C.dark,
          }}
          onFocus={e => (e.currentTarget.style.borderColor = C.petrol)}
          onBlur={e => (e.currentTarget.style.borderColor = 'transparent')}
        />

        {/* Tipo */}
        <select
          value={field.type}
          onChange={e => onUpdate({ type: e.target.value as FieldType })}
          style={{
            padding: '4px 6px', borderRadius: 6, fontSize: 11, fontWeight: 600,
            border: `1.5px solid ${C.border}`, background: 'white', color: C.dark,
            cursor: 'pointer', flexShrink: 0,
          }}
        >
          {MVP_FIELD_TYPES.map(t => (
            <option key={t} value={t}>{FIELD_TYPE_LABELS[t]}</option>
          ))}
        </select>

        {/* Expandir detalhes */}
        <button
          onClick={() => setExpanded(v => !v)}
          title="Editar placeholder e descrição"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 3, color: expanded ? C.petrol : C.muted, borderRadius: 4, flexShrink: 0 }}
        >
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        {/* Reordenação ▲▼ */}
        <button onClick={onMoveUp} disabled={!onMoveUp} style={{ background: 'none', border: 'none', padding: 2, cursor: onMoveUp ? 'pointer' : 'not-allowed', color: onMoveUp ? C.petrol : '#d1d5db', flexShrink: 0 }}>
          <ArrowUp size={13} />
        </button>
        <button onClick={onMoveDown} disabled={!onMoveDown} style={{ background: 'none', border: 'none', padding: 2, cursor: onMoveDown ? 'pointer' : 'not-allowed', color: onMoveDown ? C.petrol : '#d1d5db', flexShrink: 0 }}>
          <ArrowDown size={13} />
        </button>

        {/* Deletar campo */}
        {onRemove && (
          <button
            onClick={onRemove}
            title="Remover campo"
            style={{ background: 'none', border: 'none', padding: 3, cursor: 'pointer', color: '#fca5a5', borderRadius: 4, flexShrink: 0 }}
            onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.color = C.danger)}
            onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.color = '#fca5a5')}
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>

      {/* Detalhes: placeholder + descrição (quando expandido) */}
      {expanded && (
        <div style={{ padding: '0 10px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: C.muted, marginBottom: 3 }}>
              Placeholder (texto de dica dentro do campo)
            </label>
            <input
              value={field.placeholder}
              onChange={e => onUpdate({ placeholder: e.target.value })}
              placeholder="Ex: Descreva as habilidades observadas..."
              style={{
                width: '100%', padding: '5px 8px', borderRadius: 6, fontSize: 12, boxSizing: 'border-box',
                border: `1.5px solid ${C.border}`, background: 'white', outline: 'none',
              }}
              onFocus={e => (e.currentTarget.style.borderColor = C.petrol)}
              onBlur={e => (e.currentTarget.style.borderColor = C.border)}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: C.muted, marginBottom: 3 }}>
              Texto-base / Orientação (aparece abaixo do campo)
            </label>
            <input
              value={field.description}
              onChange={e => onUpdate({ description: e.target.value })}
              placeholder="Ex: Considerar laudos e relatórios anteriores"
              style={{
                width: '100%', padding: '5px 8px', borderRadius: 6, fontSize: 12, boxSizing: 'border-box',
                border: `1.5px solid ${C.border}`, background: 'white', outline: 'none',
              }}
              onFocus={e => (e.currentTarget.style.borderColor = C.petrol)}
              onBlur={e => (e.currentTarget.style.borderColor = C.border)}
            />
          </div>

          {/* Opções para checklist/select */}
          {(field.type === 'checklist' || field.type === 'select') && (
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: C.muted, marginBottom: 3 }}>
                Opções (uma por linha)
              </label>
              <textarea
                value={field.options.join('\n')}
                onChange={e => onUpdate({ options: e.target.value.split('\n').map(o => o.trim()).filter(Boolean) })}
                rows={3}
                placeholder="Opção 1&#10;Opção 2&#10;Opção 3"
                style={{
                  width: '100%', padding: '5px 8px', borderRadius: 6, fontSize: 12, boxSizing: 'border-box',
                  border: `1.5px solid ${C.border}`, background: 'white', outline: 'none',
                  resize: 'vertical', fontFamily: 'inherit',
                }}
                onFocus={e => (e.currentTarget.style.borderColor = C.petrol)}
                onBlur={e => (e.currentTarget.style.borderColor = C.border)}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};
