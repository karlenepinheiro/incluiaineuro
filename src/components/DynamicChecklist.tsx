// components/DynamicChecklist.tsx
// Checklist dinâmico com suporte a adicionar campos e itens personalizados
import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';

export interface DynChecklistItem {
  id: string;
  text: string;
  checked: boolean;
  isCustom?: boolean;
}

export interface DynChecklistSection {
  id: string;
  title: string;
  items: DynChecklistItem[];
  isCustom?: boolean;
}

interface Props {
  sections: DynChecklistSection[];
  onChange: (sections: DynChecklistSection[]) => void;
  allowAddItems?: boolean;
  allowAddSections?: boolean;
  readOnly?: boolean;
}

export const DynamicChecklist: React.FC<Props> = ({
  sections,
  onChange,
  allowAddItems = true,
  allowAddSections = false,
  readOnly = false,
}) => {
  const [newItemTexts, setNewItemTexts] = useState<Record<string, string>>({});
  const [newSectionTitle, setNewSectionTitle] = useState('');

  const toggleItem = (sectionId: string, itemId: string, checked: boolean) => {
    if (readOnly) return;
    onChange(sections.map(s =>
      s.id === sectionId
        ? { ...s, items: s.items.map(i => i.id === itemId ? { ...i, checked } : i) }
        : s
    ));
  };

  const addItem = (sectionId: string) => {
    const text = (newItemTexts[sectionId] || '').trim();
    if (!text) return;
    onChange(sections.map(s =>
      s.id === sectionId
        ? {
            ...s,
            items: [...s.items, {
              id: `custom_${Date.now()}_${Math.random().toString(36).slice(2)}`,
              text,
              checked: false,
              isCustom: true,
            }],
          }
        : s
    ));
    setNewItemTexts(prev => ({ ...prev, [sectionId]: '' }));
  };

  const removeItem = (sectionId: string, itemId: string) => {
    onChange(sections.map(s =>
      s.id === sectionId
        ? { ...s, items: s.items.filter(i => i.id !== itemId) }
        : s
    ));
  };

  const addSection = () => {
    const title = newSectionTitle.trim() || `Seção ${sections.length + 1}`;
    onChange([...sections, {
      id: `custom_sec_${Date.now()}`,
      title,
      items: [],
      isCustom: true,
    }]);
    setNewSectionTitle('');
  };

  const removeSection = (sectionId: string) => {
    onChange(sections.filter(s => s.id !== sectionId));
  };

  const checkedCount = sections.reduce((acc, s) => acc + s.items.filter(i => i.checked).length, 0);
  const totalCount   = sections.reduce((acc, s) => acc + s.items.length, 0);

  return (
    <div className="space-y-5">
      {/* Progresso geral */}
      {totalCount > 0 && (
        <div className="flex items-center gap-3">
          <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{ width: `${(checkedCount / totalCount) * 100}%`, background: '#1F4E5F' }}
            />
          </div>
          <span className="text-xs font-bold text-gray-500 shrink-0">
            {checkedCount}/{totalCount} marcados
          </span>
        </div>
      )}

      {sections.map(sec => (
        <div
          key={sec.id}
          className="rounded-xl border border-[#E7E2D8] overflow-hidden shadow-sm"
          style={{ background: '#fff' }}
        >
          {/* Section header */}
          <div
            className="flex items-center justify-between px-4 py-2.5"
            style={{ background: '#1F4E5F' }}
          >
            <span className="text-white font-bold text-xs uppercase tracking-wider">{sec.title}</span>
            <div className="flex items-center gap-2">
              <span className="text-[#C69214] text-xs font-bold">
                {sec.items.filter(i => i.checked).length}/{sec.items.length}
              </span>
              {sec.isCustom && !readOnly && (
                <button
                  type="button"
                  onClick={() => removeSection(sec.id)}
                  className="text-white/60 hover:text-white transition"
                >
                  <X size={13} />
                </button>
              )}
            </div>
          </div>

          {/* Items */}
          <div className="p-4 space-y-2">
            {sec.items.length === 0 && (
              <p className="text-xs text-gray-400 italic py-2 text-center">
                Nenhum item. Adicione abaixo.
              </p>
            )}
            {sec.items.map(item => (
              <label
                key={item.id}
                className={`flex items-start gap-3 p-2.5 rounded-lg border cursor-pointer transition text-sm group ${
                  item.checked
                    ? 'bg-[#1F4E5F]/6 border-[#1F4E5F]/25 text-[#1F4E5F]'
                    : 'bg-gray-50 border-gray-200 text-gray-700 hover:border-[#1F4E5F]/30'
                } ${readOnly ? 'cursor-default' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={item.checked}
                  onChange={e => toggleItem(sec.id, item.id, e.target.checked)}
                  disabled={readOnly}
                  className="mt-0.5 shrink-0 accent-[#1F4E5F]"
                />
                <span className="leading-snug flex-1">{item.text}</span>
                {item.isCustom && !readOnly && (
                  <button
                    type="button"
                    onClick={e => { e.preventDefault(); removeItem(sec.id, item.id); }}
                    className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-400 hover:text-red-500 transition shrink-0"
                  >
                    <X size={12} />
                  </button>
                )}
              </label>
            ))}

            {/* Add item row */}
            {allowAddItems && !readOnly && (
              <div className="flex gap-2 pt-2 border-t border-dashed border-gray-200 mt-2">
                <input
                  type="text"
                  className="flex-1 border border-dashed border-gray-300 rounded-lg px-3 py-2 text-xs placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1F4E5F]/20 focus:border-[#1F4E5F]/40 bg-white"
                  placeholder="Novo item de checklist..."
                  value={newItemTexts[sec.id] || ''}
                  onChange={e => setNewItemTexts(prev => ({ ...prev, [sec.id]: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addItem(sec.id); } }}
                />
                <button
                  type="button"
                  onClick={() => addItem(sec.id)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition shrink-0"
                  style={{ background: '#1F4E5F', color: '#fff' }}
                >
                  <Plus size={12} /> Adicionar item
                </button>
              </div>
            )}
          </div>
        </div>
      ))}

      {/* Add section */}
      {allowAddSections && !readOnly && (
        <div className="flex gap-2">
          <input
            type="text"
            className="flex-1 border border-dashed border-gray-300 rounded-lg px-3 py-2 text-xs placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1F4E5F]/20"
            placeholder="Título da nova seção..."
            value={newSectionTitle}
            onChange={e => setNewSectionTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSection(); } }}
          />
          <button
            type="button"
            onClick={addSection}
            className="flex items-center gap-1.5 px-4 py-2 border-2 border-dashed border-[#1F4E5F]/40 text-[#1F4E5F] rounded-lg text-xs font-bold hover:bg-[#1F4E5F]/5 transition"
          >
            <Plus size={13} /> Adicionar seção
          </button>
        </div>
      )}
    </div>
  );
};
